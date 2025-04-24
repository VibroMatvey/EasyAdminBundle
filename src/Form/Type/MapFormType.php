<?php

namespace EasyCorp\Bundle\EasyAdminBundle\Form\Type;

use EasyCorp\Bundle\EasyAdminBundle\Field\MapField;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\HiddenType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\Exception\InvalidArgumentException;
use Symfony\Component\OptionsResolver\OptionsResolver;

class MapFormType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        if ($options['objects'] === null) {
            throw new InvalidArgumentException('Objects option must be set.');
        }
        foreach ($options['objects'] as $object) {
            if (!key_exists('id', $object) || !key_exists('name', $object)) {
                throw new InvalidArgumentException('Object "id" and "name" property must be set.');
            }
        }
        $builder
            ->add('points', HiddenType::class, [
                'required' => false,
            ])
            ->add('areas', HiddenType::class, [
                'required' => false,
            ])
            ->add('objects', HiddenType::class, [
                'required' => false,
                'attr' => [
                    'value' => json_encode($options['objects']),
                ],
            ])
            ->add('file', FileUploadType::class, [
                'label' => '',
                'required' => false,
                'upload_dir' => "public/" . MapField::UPLOAD_DIR,
                'upload_filename' => "[ulid].[extension]",
                'attr' => ['accept' => 'image/*'],
            ]);
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'objects' => null,
        ]);
        $resolver->setAllowedTypes('objects', ['null', 'array']);
    }
}