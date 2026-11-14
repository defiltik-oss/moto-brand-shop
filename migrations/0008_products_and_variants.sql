ALTER TABLE catalog_products RENAME TO products;

CREATE TABLE product_variants (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  details TEXT NOT NULL CHECK(json_valid(details)),
  PRIMARY KEY (product_id, id)
);

INSERT INTO product_variants(product_id, id, position, details)
SELECT p.id, json_extract(v.value, '$.id'), CAST(v.key AS INTEGER), v.value
FROM products p, json_each(p.details, '$.colorVariants') v;

UPDATE products SET details = json_remove(details, '$.colorVariants');
