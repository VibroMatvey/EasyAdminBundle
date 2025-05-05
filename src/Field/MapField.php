<?php

namespace EasyCorp\Bundle\EasyAdminBundle\Field;

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

    public function setObjectTitlePropertyName(string $name): self
    {
        $this->setFormTypeOption('objectTitlePropertyName', $name);

        return $this;
    }

    public function setObjectIdentifierPropertyName(string|int $name): self
    {
        $this->setFormTypeOption('objectIdentifierPropertyName', $name);

        return $this;
    }

    public function setMapObjectsPropertyName(string $name): self
    {
        $this->setFormTypeOption('mapObjectsPropertyName', $name);

        return $this;
    }

    public function setObjectMapPropertyName(string $name): self
    {
        $this->setFormTypeOption('objectMapPropertyName', $name);

        return $this;
    }

    public function hidePoints(bool $hide): self
    {
        $this->setFormTypeOption('hidePoints', $hide);

        return $this;
    }

    public function hideAreas(bool $hide): self
    {
        $this->setFormTypeOption('hideAreas', $hide);

        return $this;
    }

    public function hideYouAreHere(bool $hide): self
    {
        $this->setFormTypeOption('hideYouAreHere', $hide);

        return $this;
    }
}
