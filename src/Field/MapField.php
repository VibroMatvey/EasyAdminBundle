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

    public function setObjects(array $objects): self
    {
        $this->setFormTypeOption('objects', $objects);

        return $this;
    }
}
