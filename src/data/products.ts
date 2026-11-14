/**
 * Дані каталогу товарів Alexov Shop (підтримка UK / EN).
 * Порядок товарів:
 * 1. «Щиток на самокат Vinnytsia Stunt Team» (В наявності, вибір кольору: Білий / Чорний)
 * 2. «Зіпка Alexov Street Team» (Статус «Скоро в продажу», вигляд спереду/ззаду)
 * 3. «Фірмовий стікерпак» (Статус «Немає в наявності»)
 */

export interface ProductColorOption {
  id: string;
  nameUk: string;
  nameEn: string;
  image: string;
  colorCode?: string;
  photos?: string[];
}

export interface ProductItem {
  id: string;
  title: string;
  titleUk: string;
  titleEn: string;
  categoryUk: string;
  categoryEn: string;
  descriptionUk: string;
  descriptionEn: string;
  price?: number | null;
  priceUah?: string;
  image: string;
  secondaryImage?: string;
  gallery?: string[];
  managed?: boolean;
  colorVariants?: ProductColorOption[];
  inStock: boolean;
  statusType: 'coming_soon' | 'in_stock' | 'out_of_stock' | 'maintenance';
  statusBadgeUk: string;
  statusBadgeEn: string;
  buttonTextUk: string;
  buttonTextEn: string;
  buttonAction: 'preorder' | 'order' | 'disabled';
}

export const PRODUCTS: ProductItem[] = [
  {
    id: 'scooter-shield-vst',
    title: 'Щиток на самокат «Vinnytsia Stunt Team»',
    titleUk: 'Щиток на самокат «Vinnytsia Stunt Team»',
    titleEn: 'Scooter Number Plate "Vinnytsia Stunt Team"',
    categoryUk: 'АКСЕСУАРИ • ЗАХИСТ',
    categoryEn: 'ACCESSORIES • PROTECTION',
    descriptionUk:
      'Фірмовий передній стант-щиток з логотипом Vinnytsia Stunt Team. Ударостійкий гнучкий пластик, стійкий до падінь та погодних умов. У комплекті стяжки для швидкого монтажу на кермо самоката чи електробайка.',
    descriptionEn:
      'Signature front stunt plate with Vinnytsia Stunt Team logo. Heavy-duty flexible impact-resistant plastic with zip ties for handlebars.',
    price: 300,
    priceUah: '300',
    image: '/schitok_2.0.png',
    colorVariants: [
      {
        id: 'black',
        nameUk: 'Чорний',
        nameEn: 'Black',
        image: '/schitok_2.0.png',
        colorCode: '#111111',
      },
    ],
    inStock: true,
    statusType: 'in_stock',
    statusBadgeUk: 'В наявності',
    statusBadgeEn: 'In Stock',
    buttonTextUk: 'Замовити',
    buttonTextEn: 'Order',
    buttonAction: 'order',
  },
  {
    id: 'zip-hoodie',
    title: 'Зіпка Alexov Street Team',
    titleUk: 'Зіпка Alexov Street Team',
    titleEn: 'Alexov Street Team Zip Hoodie',
    categoryUk: 'ОДЯГ • НОВА КОЛЕКЦІЯ 420 GSM',
    categoryEn: 'APPAREL • NEW DROP 420 GSM',
    descriptionUk:
      'Ексклюзивна щільна оверсайз-зіпка Alexov Street Team преміальної якості. Фірмовий авторський принт на грудях та спині, металева блискавка.',
    descriptionEn:
      'Exclusive heavyweight 420 GSM oversized zip hoodie by Alexov Street Team. Custom front and back screen print with heavy-duty metal hardware.',
    price: null,
    priceUah: '1 350',
    image: '/kofta1-pered.png',
    secondaryImage: '/kofta1-zad.png',
    inStock: false,
    statusType: 'coming_soon',
    statusBadgeUk: 'Скоро в продажу',
    statusBadgeEn: 'Coming Soon',
    buttonTextUk: 'Скоро в продажу',
    buttonTextEn: 'Coming Soon',
    buttonAction: 'disabled',
  },
  {
    id: 'stickerpack',
    title: 'Фірмовий стікерпак',
    titleUk: 'Фірмовий стікерпак',
    titleEn: 'Signature Sticker Pack',
    categoryUk: 'АКСЕСУАРИ • ЛИТИЙ ВІНІЛ З УФ-ЗАХИСТОМ',
    categoryEn: 'ACCESSORIES • UV-LAMINATED VINYL',
    descriptionUk:
      'Зносостійкий набір глянцевих вінілових наклейок Alexov Shop з ламінацією для електробайка, рами, маятника, шолома та техніки.',
    descriptionEn:
      'Weatherproof UV-laminated vinyl sticker pack designed for electric dirt bike frames, swingarms, battery covers, and helmets.',
    price: 200,
    priceUah: '200',
    image: '/stickers-1.png',
    inStock: false,
    statusType: 'out_of_stock',
    statusBadgeUk: 'Немає в наявності',
    statusBadgeEn: 'Out of Stock',
    buttonTextUk: 'Немає в наявності',
    buttonTextEn: 'Out of Stock',
    buttonAction: 'disabled',
  },
];
