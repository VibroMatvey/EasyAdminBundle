<?php

namespace EasyCorp\Bundle\EasyAdminBundle\Field;

use Doctrine\ORM\EntityManagerInterface;
use EasyCorp\Bundle\EasyAdminBundle\Config\Asset;
use EasyCorp\Bundle\EasyAdminBundle\Contracts\Field\FieldInterface;
use EasyCorp\Bundle\EasyAdminBundle\Form\Type\MapFormType;
use Symfony\Contracts\Translation\TranslatableInterface;

/**
 * @author VibroMatvey <vibromatvey@gmail.com>
 */
final class MapField implements FieldInterface
{
    use FieldTrait;

    public const UPLOAD_DIR = 'uploads/maps';

    /**
     * @param TranslatableInterface|string|false|null $label
     */
    public static function new(string $propertyName, $label = null): self
    {
        return (new self())
            ->setProperty($propertyName)
            ->setLabel($label)
            ->setTemplateName('crud/field/map')
            ->setFormType(MapFormType::class)
            ->addCssClass('map-image')
            ->addJsFiles(
                Asset::fromEasyAdminAssetPackage('field-image.js'),
                Asset::fromEasyAdminAssetPackage('field-file-upload.js'),
                Asset::fromEasyAdminAssetPackage('field-map.js'),
            );
    }

    public function setObjectFqcn(string $entityFcn): self
    {
        $this->setFormTypeOption('objectFqcn', $entityFcn);

        return $this;
    }

    public function setEntityManager(EntityManagerInterface $entityManager): self
    {
        $this->setFormTypeOption('entityManager', $entityManager);

        return $this;
    }

    public function setObjectDisplayName(string $name): self
    {
        $this->setFormTypeOption('objectDisplayName', $name);

        return $this;
    }

    public function setObjectIdentifier(string|int $identifier): self
    {
        $this->setFormTypeOption('objectDisplayIdentifier', $identifier);

        return $this;
    }
}
