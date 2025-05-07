<?php

namespace EasyCorp\Bundle\EasyAdminBundle\Field\Configurator;

use Doctrine\ORM\EntityManager;
use EasyCorp\Bundle\EasyAdminBundle\Context\AdminContext;
use EasyCorp\Bundle\EasyAdminBundle\Contracts\Field\FieldConfiguratorInterface;
use EasyCorp\Bundle\EasyAdminBundle\Dto\EntityDto;
use EasyCorp\Bundle\EasyAdminBundle\Dto\FieldDto;
use EasyCorp\Bundle\EasyAdminBundle\Field\MapField;
use RuntimeException;
use Symfony\Component\OptionsResolver\Exception\InvalidArgumentException;

/**
 * @author Vibro Matvey <vibromatvey@gmail.com>
 */
final class MapConfigurator implements FieldConfiguratorInterface
{
    private EntityManager $entityManager;

    public function __construct(
        EntityManager $entityManager,
    )
    {
        $this->entityManager = $entityManager;
    }

    public function supports(FieldDto $field, EntityDto $entityDto): bool
    {
        return MapField::class === $field->getFieldFqcn();
    }

    public function configure(FieldDto $field, EntityDto $entityDto, AdminContext $context): void
    {
        $map = $entityDto->getInstance();
        $naviServiceUrl = $field->getFormTypeOption('naviServiceUrl');
        $hideRoads = $field->getFormTypeOption('hideRoads');
        $objectTitlePropertyName = $field->getFormTypeOption('objectTitlePropertyName');
        $objectMapPropertyName = $field->getFormTypeOption('objectMapPropertyName');
        $mapObjectsPropertyName = $field->getFormTypeOption('mapObjectsPropertyName');
        $objectIdentifierPropertyName = $field->getFormTypeOption('objectIdentifierPropertyName');
        $objectFqcn = $entityDto->getPropertyMetadata($mapObjectsPropertyName)->get('targetEntity');
        $objectRepository = $this->entityManager->getRepository($objectFqcn);

        $field->setFormTypeOptionIfNotSet('objectFqcn', $objectFqcn);
        $field->setFormTypeOptionIfNotSet('objectRepository', $objectRepository);
        $field->setFormTypeOptionIfNotSet('map', $map);

        $mapObjects = $objectRepository->findBy([$objectMapPropertyName => $map]);
        $allObjects = $objectRepository->findBy([$objectMapPropertyName => [$map, null]]);
        $identifierGetter = 'get' . ucfirst($objectIdentifierPropertyName);
        if (!method_exists(new $objectFqcn, $identifierGetter)) {
            throw new InvalidArgumentException('Method ' . $identifierGetter . 'does not exist for objectFqcn: ' . $objectFqcn);
        }
        $nameGetter = 'get' . ucfirst($objectTitlePropertyName);
        if (!method_exists(new $objectFqcn, $nameGetter)) {
            throw new InvalidArgumentException('Method ' . $nameGetter . 'does not exist for objectFqcn: ' . $objectFqcn);
        }
        $points = [];
        foreach ($mapObjects as $object) {
            $point = $object->getPoint();
            if ($point && is_array($point) && isset($point['x'], $point['y'])) {
                $points[] = [
                    'x' => $point['x'],
                    'y' => $point['y'],
                    'objectId' => $object->$identifierGetter()
                ];
            }
        }
        $areas = [];
        foreach ($mapObjects as $object) {
            $area = $object->getArea();
            if ($area && is_array($area) && !empty($area)) {
                $areas[] = [
                    'points' => $area,
                    'objectId' => $object->$identifierGetter()
                ];
            }
        }

        $objects = array_map(fn($object) => ['name' => $object->$nameGetter(), 'id' => $object->$identifierGetter()], $allObjects);

        $field->setFormTypeOptionIfNotSet('points', json_encode($points));
        $field->setFormTypeOptionIfNotSet('areas', json_encode($areas));
        $field->setFormTypeOptionIfNotSet('objects', json_encode($objects));
        $field->setFormTypeOptionIfNotSet('roads', json_encode([]));

        if ($hideRoads === null && $naviServiceUrl != null) {
            $available = $this->checkAvailableNaviService($naviServiceUrl);
            if (!$available) {
                throw new RuntimeException("Navi service not available for $naviServiceUrl");
            }
        }
    }

    /**
     * Проверяет доступность API-сервиса по указанному URL и эндпоинту.
     *
     * @param string $url Базовый URL сервиса
     * @param string $endpoint Эндпоинт для проверки (по умолчанию 'ping')
     * @return bool Возвращает true, если сервис доступен (HTTP 200 и валидный JSON)
     */
    private function checkAvailableNaviService(string $url, string $endpoint = 'ping'): bool
    {
        $ch = curl_init();
        try {
            $fullUrl = rtrim($url, '/') . '/' . ltrim($endpoint, '/');

            curl_setopt_array($ch, [
                CURLOPT_URL => $fullUrl,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPGET => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_HTTPHEADER => [
                    'Accept: application/json',
                ],
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
            ]);

            $response = curl_exec($ch);

            if ($response === false) {
                throw new RuntimeException('cURL Error: ' . curl_error($ch) . ' (Code: ' . curl_errno($ch) . ')');
            }

            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

            if ($httpCode !== 200) {
                throw new RuntimeException("API check failed: HTTP Code $httpCode for $fullUrl");
            }

            $decodedResponse = json_decode($response, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new RuntimeException('API check failed: Invalid JSON response from ' . $fullUrl);
            }

            if (isset($decodedResponse['status']) && $decodedResponse['status'] !== 'ok') {
                throw new RuntimeException('API check failed: Status not OK in response from ' . $fullUrl);
            }

            return true;
        } catch (\Exception $e) {
            throw new RuntimeException('API check exception: ' . $e->getMessage() . ' for ' . $url);
        } finally {
            curl_close($ch);
        }
    }
}
