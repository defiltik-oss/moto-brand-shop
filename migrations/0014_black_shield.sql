-- Keep the existing product ID and order history and replace its variant set.
UPDATE products
SET hidden = 0,
    details = json_set(
      json_remove(details, '$.secondaryImage', '$.colorVariants'),
      '$.image', '/schitok_2.0.png',
      '$.gallery', json_array('/schitok_2.0.png'),
      '$.inStock', json('true'),
      '$.statusType', 'in_stock',
      '$.statusBadgeUk', 'В наявності',
      '$.statusBadgeEn', 'In Stock',
      '$.buttonTextUk', 'Замовити',
      '$.buttonTextEn', 'Order',
      '$.buttonAction', 'order'
    )
WHERE id = 'scooter-shield-vst';

DELETE FROM product_variants WHERE product_id = 'scooter-shield-vst';

INSERT INTO product_variants(product_id, id, position, details)
SELECT id, 'black', 0, json_object(
  'id', 'black',
  'nameUk', 'Чорний',
  'nameEn', 'Black',
  'image', '/schitok_2.0.png',
  'photos', json_array('/schitok_2.0.png'),
  'colorCode', '#111111'
)
FROM products WHERE id = 'scooter-shield-vst';
