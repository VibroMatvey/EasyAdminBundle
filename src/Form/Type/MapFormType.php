<?php

namespace EasyCorp\Bundle\EasyAdminBundle\Form\Type;

use EasyCorp\Bundle\EasyAdminBundle\Field\MapField;
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
            'objectRepository' => null,
            'points' => null,
            'areas' => null,
            'objects' => null,
            'map' => null,
        ]);
        $resolver->setAllowedTypes('objectTitlePropertyName', ['null', 'string']);
        $resolver->setAllowedTypes('objectMapPropertyName', ['null', 'string']);
        $resolver->setAllowedTypes('mapObjectsPropertyName', ['null', 'string']);
        $resolver->setAllowedTypes('objectIdentifierPropertyName', ['null', 'string', 'int']);
        $resolver->setAllowedTypes('hidePoints', ['null', 'bool']);
        $resolver->setAllowedTypes('hideAreas', ['null', 'bool']);
        $resolver->setAllowedTypes('hideYouAreHere', ['null', 'bool']);
    }
}