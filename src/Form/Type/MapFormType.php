<?php

namespace EasyCorp\Bundle\EasyAdminBundle\Form\Type;

use Doctrine\ORM\EntityManagerInterface;
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
        if ($options['objectFqcn'] === null) {
            throw new InvalidArgumentException('objectFqcn option must be set.');
        }
        if ($options['entityManager'] === null) {
            throw new InvalidArgumentException('entityManager option must be set.');
        }
        if ($options['objectDisplayName'] === null) {
            throw new InvalidArgumentException('objectDisplayName option must be set.');
        }
        if ($options['objectDisplayIdentifier'] === null) {
            throw new InvalidArgumentException('objectDisplayIdentifier option must be set.');
        }
        if (!class_exists($options['objectFqcn'])) {
            throw new InvalidArgumentException('Class does not exist: ' . $options['objectFqcn']);
        }
        if (!property_exists(new $options['objectFqcn'], 'point')) {
            throw new InvalidArgumentException('Point property does not exist: ' . $options['objectFqcn']);
        }
        if (!property_exists(new $options['objectFqcn'], 'area')) {
            throw new InvalidArgumentException('Point property does not exist: ' . $options['objectFqcn']);
        }
        $mapObjectsRepository = $options['entityManager']->getRepository($options['objectFqcn']);
        if (!$mapObjectsRepository) {
            throw new InvalidArgumentException('Repository for objectFqcn does not exist: ' . $options['objectFqcn']);
        }
        $identifierGetter = 'get' . ucfirst($options['objectDisplayIdentifier']);
        if (!method_exists(new $options['objectFqcn'], $identifierGetter)) {
            throw new InvalidArgumentException('Method ' . $identifierGetter . 'does not exist for objectFqcn: ' . $options['objectFqcn']);
        }
        $nameGetter = 'get' . ucfirst($options['objectDisplayName']);
        if (!method_exists(new $options['objectFqcn'], $nameGetter)) {
            throw new InvalidArgumentException('Method ' . $nameGetter . 'does not exist for objectFqcn: ' . $options['objectFqcn']);
        }
        $dbObjects = $mapObjectsRepository->findAll();
        $points = [];
        foreach ($dbObjects as $object) {
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
        foreach ($dbObjects as $object) {
            $area = $object->getArea();
            if ($area && is_array($area) && !empty($area)) {
                $areas[] = [
                    'points' => $area,
                    'objectId' => $object->$identifierGetter()
                ];
            }
        }
        $objects = array_map(fn($object) => ['name' => $object->$nameGetter(), 'id' => $object->$identifierGetter()], $dbObjects);
        $builder
            ->addEventListener(FormEvents::PRE_SUBMIT, function (PreSubmitEvent $event) use ($dbObjects, $mapObjectsRepository): void {
                $map = $event->getData();

                foreach ($dbObjects as $mapObject) {
                    $mapObject->setPoint(null);
                    $mapObject->setArea(null);
                    $mapObjectsRepository->save($mapObject);
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
                    $mapObject = $mapObjectsRepository->find($point['objectId']);
                    if (!$mapObject) {
                        continue;
                    }
                    $mapObject->setPoint([
                        "x" => $point['x'],
                        "y" => $point['y'],
                    ]);
                }

                foreach ($areas as $area) {
                    if (!$area['objectId']) {
                        continue;
                    }
                    $mapObject = $mapObjectsRepository->find($area['objectId']);
                    if (!$mapObject) {
                        continue;
                    }
                    $mapObject->setArea($area['points']);
                }
            });
        $builder
            ->add('points', HiddenType::class, [
                'required' => false,
                'attr' => [
                    'value' => json_encode($points),
                ],
            ])
            ->add('areas', HiddenType::class, [
                'required' => false,
                'attr' => [
                    'value' => json_encode($areas),
                ],
            ])
            ->add('objects', HiddenType::class, [
                'required' => false,
                'attr' => [
                    'value' => json_encode($objects),
                ],
            ])
            ->add('youAreHere', HiddenType::class, [
                'required' => false,
                'attr' => [
//                    'value' => json_encode($objects),
                ],
            ])
            ->add('file', FileUploadType::class, [
                'label' => '',
                'required' => false,
                'upload_dir' => "public/" . MapField::UPLOAD_DIR,
                'upload_filename' => "[ulid].[extension]",
                'attr' => ['accept' => 'image/*'],
                'allow_delete' => false
            ]);
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'objectFqcn' => null,
            'objectDisplayName' => null,
            'objectDisplayIdentifier' => null,
            'entityManager' => null,
        ]);
        $resolver->setAllowedTypes('objectFqcn', ['null', 'string']);
        $resolver->setAllowedTypes('objectDisplayName', ['null', 'string']);
        $resolver->setAllowedTypes('objectDisplayIdentifier', ['null', 'string']);
        $resolver->setAllowedTypes('entityManager', ['null', EntityManagerInterface::class]);
    }
}