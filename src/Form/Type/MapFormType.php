<?php

namespace EasyCorp\Bundle\EasyAdminBundle\Form\Type;

use EasyCorp\Bundle\EasyAdminBundle\Field\MapField;
use RuntimeException;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Event\PreSubmitEvent;
use Symfony\Component\Form\Extension\Core\Type\HiddenType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\Form\FormEvents;
use Symfony\Component\OptionsResolver\Exception\InvalidArgumentException;
use Symfony\Component\OptionsResolver\OptionsResolver;

class MapFormType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        if ($options['objectTitlePropertyName'] === null) {
            throw new InvalidArgumentException('objectTitlePropertyName option must be set.');
        }
        if ($options['objectIdentifierPropertyName'] === null) {
            throw new InvalidArgumentException('objectIdentifierPropertyName option must be set.');
        }
        if ($options['objectMapPropertyName'] === null) {
            throw new InvalidArgumentException('objectMapPropertyName option must be set.');
        }
        if ($options['mapObjectsPropertyName'] === null) {
            throw new InvalidArgumentException('mapObjectsPropertyName option must be set.');
        }
        if (!property_exists(new $options['objectFqcn'], 'point')) {
            throw new InvalidArgumentException('Point property does not exist: ' . $options['objectFqcn']);
        }
        if (!property_exists(new $options['objectFqcn'], 'area')) {
            throw new InvalidArgumentException('Point property does not exist: ' . $options['objectFqcn']);
        }
        $builder
            ->addEventListener(FormEvents::PRE_SUBMIT, function (PreSubmitEvent $event) use ($options): void {
                $mapSetter = 'set' . ucfirst($options['objectMapPropertyName']);
                $dbObjects = $options['objectRepository']->findBy([$options['objectMapPropertyName'] => $options['map']]);
                $map = $event->getData();

                foreach ($dbObjects as $mapObject) {
                    $mapObject->setPoint(null);
                    $mapObject->setArea(null);
                    $mapObject->$mapSetter(null);
                    $options['objectRepository']->save($mapObject);
                }

                if (key_exists('delete', $map['file'])) {
                    if ($map['file']['delete'] == 1) {
                        return;
                    }
                }

                $points = json_decode($map['points'], true);
                $areas = json_decode($map['areas'], true);
                $roads = json_decode($map['roads'], true);

                foreach ($points as $point) {
                    if (!$point['objectId']) {
                        continue;
                    }
                    $mapObject = $options['objectRepository']->find($point['objectId']);
                    if (!$mapObject) {
                        continue;
                    }
                    $mapObject->setPoint([
                        "x" => $point['x'],
                        "y" => $point['y'],
                    ]);
                    $mapObject->$mapSetter($options['map']);
                }

                foreach ($areas as $area) {
                    if (!$area['objectId']) {
                        continue;
                    }
                    $mapObject = $options['objectRepository']->find($area['objectId']);
                    if (!$mapObject) {
                        continue;
                    }
                    $mapObject->setArea($area['points']);
                    $mapObject->$mapSetter($options['map']);
                }
                $this->createRoads($roads, $options['naviServiceUrl']);
            });
        $builder
            ->add('points', HiddenType::class, [
                'required' => false,
                'attr' => [
                    'value' => $options['points'],
                    'mapped' => false,
                    'map-data-id' => 'points',
                    'map-data-hide' => !$options['hidePoints'],
                ],
            ])
            ->add('areas', HiddenType::class, [
                'required' => false,
                'attr' => [
                    'value' => $options['areas'],
                    'mapped' => false,
                    'map-data-id' => 'areas',
                    'map-data-hide' => !$options['hideAreas'],
                ],
            ])
            ->add('roads', HiddenType::class, [
                'required' => false,
                'attr' => [
                    'value' => $options['roads'],
                    'mapped' => false,
                    'map-data-id' => 'roads',
                    'map-data-hide' => !$options['hideRoads'],
                ],
            ])
            ->add('objects', HiddenType::class, [
                'required' => false,
                'attr' => [
                    'value' => $options['objects'],
                    'mapped' => false,
                    'map-data-id' => 'objects'
                ],
            ])
            ->add('youAreHere', HiddenType::class, [
                'required' => false,
                'attr' => [
                    'map-data-hide' => !$options['hideYouAreHere'],
                    'map-data-id' => 'youAreHere',
                ],
            ])
            ->add('file', FileUploadType::class, [
                'label' => '',
                'required' => false,
                'upload_dir' => "public/" . MapField::UPLOAD_DIR,
                'upload_filename' => "[ulid].[extension]",
                'attr' => ['accept' => 'image/*', 'map-data-id' => 'file'],
                'allow_delete' => false
            ]);
    }

    /**
     * Creates multiple roads via API batch-create endpoint.
     *
     * @param array $roads Array of roads, each with 'from' and 'to' keys
     * @param string $url Base URL of the API
     * @return array Decoded JSON response from the API
     * @throws InvalidArgumentException If input data is invalid
     * @throws RuntimeException If cURL request fails or API returns an error
     */
    private function createRoads(array $roads, string $url): void
    {
        if (empty($roads)) {
            return;
        }

        $data = array_map(fn($road) => ['start' => $road['from'], 'end' => $road['to']], $roads);
        $payload = json_encode($data);
        if ($payload === false) {
            throw new \RuntimeException('Failed to encode roads data to JSON');
        }

        $fullUrl = rtrim($url, '/') . '/roads/batch-create';

        $ch = curl_init();
        try {
            curl_setopt_array($ch, [
                CURLOPT_URL => $fullUrl,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json',
                    'Content-Length: ' . strlen($payload),
                ],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
            ]);

            $response = curl_exec($ch);
            if ($response === false) {
                $error = curl_error($ch);
                $errno = curl_errno($ch);
                throw new RuntimeException("cURL error: $error (Code: $errno)");
            }

            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            if ($httpCode !== 200) {
                throw new RuntimeException("API returned HTTP code $httpCode: $response");
            }

            $decoded = json_decode($response, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new RuntimeException('Invalid JSON response from API: ' . json_last_error_msg());
            }

            if (isset($decoded['error'])) {
                throw new RuntimeException('API error: ' . $decoded['error']);
            }
        } catch (\Exception $e) {
            throw new RuntimeException("Failed to create roads: {$e->getMessage()} for URL: $fullUrl");
        } finally {
            curl_close($ch);
        }
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'objectFqcn' => null,
            'objectTitlePropertyName' => null,
            'objectIdentifierPropertyName' => null,
            'objectMapPropertyName' => null,
            'mapObjectsPropertyName' => null,
            'hidePoints' => false,
            'hideAreas' => false,
            'hideYouAreHere' => false,
            'hideRoads' => false,
            'naviServiceUrl' => null,
            'objectRepository' => null,
            'points' => null,
            'areas' => null,
            'objects' => null,
            'map' => null,
            'roads' => null,
        ]);
        $resolver->setAllowedTypes('objectTitlePropertyName', ['null', 'string']);
        $resolver->setAllowedTypes('objectMapPropertyName', ['null', 'string']);
        $resolver->setAllowedTypes('mapObjectsPropertyName', ['null', 'string']);
        $resolver->setAllowedTypes('objectIdentifierPropertyName', ['null', 'string', 'int']);
        $resolver->setAllowedTypes('hidePoints', ['null', 'bool']);
        $resolver->setAllowedTypes('hideAreas', ['null', 'bool']);
        $resolver->setAllowedTypes('hideYouAreHere', ['null', 'bool']);
        $resolver->setAllowedTypes('hideRoads', ['null', 'bool']);
        $resolver->setAllowedTypes('naviServiceUrl', ['null', 'string']);
    }
}