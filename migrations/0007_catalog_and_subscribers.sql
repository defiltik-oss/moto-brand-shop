CREATE TABLE catalog_products (
  id TEXT PRIMARY KEY,
  details TEXT NOT NULL CHECK(json_valid(details)),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1))
);
CREATE TABLE catalog_photos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES catalog_products(id),
  mime TEXT NOT NULL,
  content BLOB NOT NULL
);
CREATE INDEX catalog_photos_product ON catalog_photos(product_id);
CREATE TABLE subscriber_cache (
  channel TEXT PRIMARY KEY,
  count INTEGER,
  fetched_at INTEGER,
  retry_at INTEGER NOT NULL
);
INSERT INTO catalog_products(id,details) VALUES
('scooter-shield-vst','{"id":"scooter-shield-vst","title":"Щиток на самокат «Vinnytsia Stunt Team»","titleUk":"Щиток на самокат «Vinnytsia Stunt Team»","titleEn":"Scooter Number Plate \"Vinnytsia Stunt Team\"","categoryUk":"АКСЕСУАРИ • ЗАХИСТ","categoryEn":"ACCESSORIES • PROTECTION","descriptionUk":"Фірмовий передній стант-щиток з логотипом Vinnytsia Stunt Team. Ударостійкий гнучкий пластик, стійкий до падінь та погодних умов. У комплекті стяжки для швидкого монтажу на кермо самоката чи електробайка.","descriptionEn":"Signature front stunt plate with Vinnytsia Stunt Team logo. Heavy-duty flexible impact-resistant plastic with zip ties for handlebars.","price":300,"priceUah":"300","image":"/images/products/schitok_bel.png","colorVariants":[{"id":"white","nameUk":"Білий","nameEn":"White","image":"/images/products/schitok_bel.png","colorCode":"#ffffff"},{"id":"black","nameUk":"Чорний","nameEn":"Black","image":"/images/products/schitok_cher.png","colorCode":"#111111"}],"inStock":true,"statusType":"in_stock","statusBadgeUk":"В наявності","statusBadgeEn":"In Stock","buttonTextUk":"Замовити","buttonTextEn":"Order","buttonAction":"order"}'),
('zip-hoodie','{"id":"zip-hoodie","title":"Зіпка Alexov Street Team","titleUk":"Зіпка Alexov Street Team","titleEn":"Alexov Street Team Zip Hoodie","categoryUk":"ОДЯГ • НОВА КОЛЕКЦІЯ 420 GSM","categoryEn":"APPAREL • NEW DROP 420 GSM","descriptionUk":"Ексклюзивна щільна оверсайз-зіпка Alexov Street Team преміальної якості. Фірмовий авторський принт на грудях та спині, металева блискавка.","descriptionEn":"Exclusive heavyweight 420 GSM oversized zip hoodie by Alexov Street Team. Custom front and back screen print with heavy-duty metal hardware.","price":null,"priceUah":"1 350","image":"/kofta1-pered.png","secondaryImage":"/kofta1-zad.png","inStock":false,"statusType":"coming_soon","statusBadgeUk":"Скоро в продажу","statusBadgeEn":"Coming Soon","buttonTextUk":"Скоро в продажу","buttonTextEn":"Coming Soon","buttonAction":"disabled"}'),
('stickerpack','{"id":"stickerpack","title":"Фірмовий стікерпак","titleUk":"Фірмовий стікерпак","titleEn":"Signature Sticker Pack","categoryUk":"АКСЕСУАРИ • ЛИТИЙ ВІНІЛ З УФ-ЗАХИСТОМ","categoryEn":"ACCESSORIES • UV-LAMINATED VINYL","descriptionUk":"Зносостійкий набір глянцевих вінілових наклейок Alexov Shop з ламінацією для електробайка, рами, маятника, шолома та техніки.","descriptionEn":"Weatherproof UV-laminated vinyl sticker pack designed for electric dirt bike frames, swingarms, battery covers, and helmets.","price":200,"priceUah":"200","image":"/stickers-1.png","inStock":false,"statusType":"out_of_stock","statusBadgeUk":"Немає в наявності","statusBadgeEn":"Out of Stock","buttonTextUk":"Немає в наявності","buttonTextEn":"Out of Stock","buttonAction":"disabled"}');
