<?php

namespace EasyCorp\Bundle\EasyAdminBundle\Field\Configurator;

use Doctrine\ORM\EntityManager;
use EasyCorp\Bundle\EasyAdminBundle\Context\AdminContext;
use EasyCorp\Bundle\EasyAdminBundle\Contracts\Field\FieldConfiguratorInterface;
use EasyCorp\Bundle\EasyAdminBundle\Dto\EntityDto;
use EasyCorp\Bundle\EasyAdminBundle\Dto\FieldDto;
use EasyCorp\Bundle\EasyAdminBundle\Field\MapField;
use Symfony\Component\OptionsResolver\Exception\InvalidArgumentException;

/**
 * @author Javier Eguiluz <javier.eguiluz@gmail.com>
 */
final class MapConfigurator implements FieldConfiguratorInterface
{
    private EntityManager $entityManager;

    public function __construct(
        EntityManager $entityManager
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
    }
}
