/**
 * The static content for the Sabah El Lail demo restaurant.
 *
 * Kept apart from the install logic so the dev-time Prisma seed script
 * (`prisma/seed-sabah.ts`) and the production admin API
 * (`/api/admin/install-sabah-demo`) share one source of truth; a dish
 * added here reaches both. Images are referenced by `sourceUrl` pointing at
 * files shipped in `/public/sabah/assets/menu/`.
 */

export interface SabahItem {
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  priceMinor: number;
  calories?: number;
  image?: string;
  featured?: boolean;
  tags?: string[];
}

export interface SabahCategory {
  key: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  image?: string;
  items: SabahItem[];
}

const SABAH_HOURS = {
  mon: [{ open: '12:00', close: '03:00' }],
  tue: [{ open: '12:00', close: '03:00' }],
  wed: [{ open: '12:00', close: '03:00' }],
  thu: [{ open: '12:00', close: '03:00' }],
  fri: [{ open: '12:00', close: '03:00' }],
  sat: [{ open: '12:00', close: '03:00' }],
  sun: [{ open: '12:00', close: '03:00' }],
};

export const SABAH_PROFILE = {
  publicId: 'SBH001',
  menuKey: 'main',
  payload: {
    slug: 'sabah-el-lail',
    type: 'RESTAURANT',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr: 'مطعم صباح الليل',
    nameEn: 'Sabah El Lail',
    descriptionAr: 'شاورما • بروستد • مشويات • بيتزا • عصائر طازجة',
    descriptionEn: 'Shawarma • Broasted • Charcoal BBQ • Pizza • Fresh Juices',
    templateKey: 'street-food',
    variantKey: 'a',
    phone: '+966580060067',
    whatsapp: '966580060067',
    googleMapsUrl:
      'https://www.google.com/maps/search/?api=1&query=%D9%85%D8%B7%D8%B9%D9%85+%D8%B5%D8%A8%D8%A7%D8%AD+%D8%A7%D9%84%D9%84%D9%8A%D9%84+%D8%AD%D9%8A+%D8%A7%D9%84%D8%B5%D8%AD%D8%A7%D9%81%D8%A9+%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6',
    addressAr: 'حي الصحافة، شمال الرياض، المملكة العربية السعودية',
    addressEn: 'Al-Sahafa District, North Riyadh, Saudi Arabia',
    showPlatformFooter: true,
    workingHours: SABAH_HOURS,
  },
} as const;

export const SABAH_BRAND = {
  // Taken from the restaurant's logo: emerald green and gold.
  colorPrimary: '#059669',
  colorSecondary: '#065F46',
  colorAccent: '#F59E0B',
  colorBackground: '#FBF6ED',
  colorSurface: '#FFFFFF',
  colorText: '#1A0F08',
  colorMuted: '#7A6050',
  colorBorder: '#E8DCC8',
  fontHeading: 'system-serif',
  fontBody: 'system-sans',
  radiusScale: 'lg',
} as const;

export const SABAH_CATEGORIES: SabahCategory[] = [
  {
    key: 'combos',
    nameAr: 'عروض الكومبو والتوفير',
    nameEn: 'Combos & Special Deals',
    descriptionAr: 'وجبات كومبو متكاملة مع بطاطس ومشروب كينزا المنعش.',
    descriptionEn: 'Value combo meals with crispy fries and Kinza drink.',
    image: '/sabah/assets/menu/combo_qarmsha.png',
    items: [
      {
        code: 'CMB-001',
        nameAr: 'برجر دجاج كومبو',
        nameEn: 'Chicken Burger Combo',
        descriptionAr: 'برجر دجاج مقرمش + بطاطا مقلية + مشروب كينزا بارد.',
        descriptionEn: 'Crispy chicken burger + golden fries + Kinza drink.',
        priceMinor: 1900,
        calories: 780,
        image: '/sabah/assets/menu/combo_chicken.png',
        featured: true,
      },
      {
        code: 'CMB-002',
        nameAr: 'وجبة القرمشة كومبو',
        nameEn: 'Alqarmsha Crispy Combo',
        descriptionAr: 'قطع بروستد ذهبية + بطاطا + كينزا + صوص ثوم.',
        descriptionEn: 'Golden crispy broasted + fries + Kinza + garlic sauce.',
        priceMinor: 2100,
        calories: 890,
        image: '/sabah/assets/menu/combo_qarmsha.png',
        featured: true,
      },
      {
        code: 'CMB-003',
        nameAr: 'بروستد عائلي (8 قطع)',
        nameEn: 'Family Broasted Meal (8 pcs)',
        descriptionAr: '8 قطع بروستد + كولا 1 لتر + بطاطا كبيرة + ثومية.',
        descriptionEn: '8 pcs broasted + 1L Cola + large fries + garlic sauce.',
        priceMinor: 4300,
        calories: 2100,
        image: '/sabah/assets/menu/combo_family.png',
        featured: true,
      },
      {
        code: 'CMB-004',
        nameAr: 'وجبة المسحب',
        nameEn: 'Almosahab Chicken Meal',
        descriptionAr: 'نصف دجاج مسحب + بطاطا + حمص + سلطة + كينزا.',
        descriptionEn: 'Half mosahab chicken + fries + hummus + salad + Kinza.',
        priceMinor: 2600,
        calories: 820,
        image: '/sabah/assets/menu/combo_mosahab.png',
      },
    ],
  },
  {
    key: 'shawarma',
    nameAr: 'الشاورما',
    nameEn: 'Shawarma',
    descriptionAr: 'شاورما بالخبز الصاج والتركي وخلطة صباح الليل السرية.',
    descriptionEn: 'Freshly carved shawarma with the signature house blend.',
    image: '/sabah/assets/menu/dish_shawarma.png',
    items: [
      {
        code: 'SHW-001',
        nameAr: 'شاورما عربي',
        nameEn: 'Arabic Shawarma',
        descriptionAr: 'شاورما بخبز الصاج مع الثومية والمخلل.',
        descriptionEn: 'Shawarma in saj bread with garlic dip and pickles.',
        priceMinor: 900,
        calories: 410,
        image: '/sabah/assets/menu/dish_shawarma.png',
        featured: true,
      },
      {
        code: 'SHW-002',
        nameAr: 'شاورما تركي',
        nameEn: 'Turkish Shawarma',
        descriptionAr: 'شاورما بالخبز التركي مع الصلصة الحارة والجبنة.',
        descriptionEn: 'Shawarma in Turkish bread with spicy sauce and cheese.',
        priceMinor: 1200,
        calories: 520,
        image: '/sabah/assets/menu/dish_shawarma.png',
      },
      {
        code: 'SHW-003',
        nameAr: 'صاروخ شاورما',
        nameEn: 'Shawarma Sarookh',
        descriptionAr: 'شاورما مع بطاطا وثومية مرلوفة بخبز صاج.',
        descriptionEn: 'Shawarma rolled with fries and garlic in saj bread.',
        priceMinor: 1300,
        calories: 580,
        image: '/sabah/assets/menu/dish_shawarma.png',
      },
    ],
  },
  {
    key: 'broasted',
    nameAr: 'البروستد والتندر',
    nameEn: 'Broasted & Tenders',
    descriptionAr: 'دجاج مقلي مقرمش ذهبي مع خلطة صباح الليل الخاصة.',
    descriptionEn: 'Golden crispy fried broasted chicken with secret seasoning.',
    image: '/sabah/assets/menu/feature_broasted.png',
    items: [
      {
        code: 'BRS-001',
        nameAr: 'بروستد ربع (قطعتين)',
        nameEn: 'Broasted Quarter (2 pcs)',
        descriptionAr: 'قطعتين بروستد مقرمش + ثومية.',
        descriptionEn: '2 crispy broasted pieces + garlic sauce.',
        priceMinor: 1500,
        calories: 540,
        image: '/sabah/assets/menu/dish_broasted_cut.png',
        featured: true,
      },
      {
        code: 'BRS-002',
        nameAr: 'بروستد نصف (4 قطع)',
        nameEn: 'Broasted Half (4 pcs)',
        descriptionAr: '4 قطع بروستد مقرمش + ثومية + خبز.',
        descriptionEn: '4 crispy broasted pieces + garlic sauce + bread.',
        priceMinor: 2500,
        calories: 1080,
        image: '/sabah/assets/menu/dish_broasted_cut.png',
      },
      {
        code: 'BRS-003',
        nameAr: 'تندر دجاج (5 قطع)',
        nameEn: 'Chicken Tenders (5 pcs)',
        descriptionAr: 'أصابع دجاج مقرمشة + صوصين للاختيار.',
        descriptionEn: 'Crispy chicken tenders + 2 dipping sauces.',
        priceMinor: 1700,
        calories: 620,
        image: '/sabah/assets/menu/feature_broasted.png',
      },
    ],
  },
  {
    key: 'grills',
    nameAr: 'المشويات على الفحم',
    nameEn: 'Charcoal BBQ Grills',
    descriptionAr: 'مشاوي لحم ودجاج طازجة على الفحم مع الخبز والمقبلات.',
    descriptionEn: 'Fresh meats grilled over natural wood charcoal.',
    image: '/sabah/assets/menu/dish_sandwiches.png',
    items: [
      {
        code: 'GRL-001',
        nameAr: 'شيش طاووق مشوي',
        nameEn: 'Grilled Shish Tawooq',
        descriptionAr: 'أسياخ دجاج متبل مشوي على الفحم.',
        descriptionEn: 'Marinated chicken skewers grilled over charcoal.',
        priceMinor: 2800,
        calories: 540,
        image: '/sabah/assets/menu/combo_shish.png',
        featured: true,
      },
      {
        code: 'GRL-002',
        nameAr: 'كباب لحم',
        nameEn: 'Meat Kebab',
        descriptionAr: 'كباب لحم بقري متبل مشوي على الفحم مع البصل والبقدونس.',
        descriptionEn: 'Charcoal-grilled beef kebab with onions and parsley.',
        priceMinor: 3200,
        calories: 610,
        image: '/sabah/assets/menu/dish_sandwiches.png',
      },
    ],
  },
  {
    key: 'sandwiches',
    nameAr: 'ساندويشات المشاوي',
    nameEn: 'Grilled Sandwiches',
    descriptionAr: 'ساندويشات كباب وشيش طاووق وأوصال طازجة.',
    descriptionEn: 'Freshly grilled skewers wrapped in artisan warm bread.',
    image: '/sabah/assets/menu/dish_sandwiches.png',
    items: [
      {
        code: 'SND-001',
        nameAr: 'ساندويتش شيش طاووق',
        nameEn: 'Shish Tawooq Sandwich',
        priceMinor: 1400,
        calories: 480,
        image: '/sabah/assets/menu/dish_sandwiches.png',
      },
      {
        code: 'SND-002',
        nameAr: 'ساندويتش كباب',
        nameEn: 'Kebab Sandwich',
        priceMinor: 1600,
        calories: 540,
        image: '/sabah/assets/menu/dish_sandwiches.png',
      },
    ],
  },
  {
    key: 'burgers',
    nameAr: 'البرجر والساندويتشات',
    nameEn: 'Burgers',
    descriptionAr: 'برجر لحم بقري صافي وبرجر دجاج مقرمش وزنجر حار.',
    descriptionEn: 'Juicy gourmet beef and crispy chicken burgers.',
    image: '/sabah/assets/menu/dish_burger.png',
    items: [
      {
        code: 'BRG-001',
        nameAr: 'برجر لحم كلاسيك',
        nameEn: 'Classic Beef Burger',
        descriptionAr: 'برجر لحم مشوي مع جبنة شيدر والخس والطماطم.',
        descriptionEn: 'Grilled beef patty with cheddar, lettuce and tomato.',
        priceMinor: 1800,
        calories: 650,
        image: '/sabah/assets/menu/dish_burger.png',
      },
      {
        code: 'BRG-002',
        nameAr: 'زنجر حار',
        nameEn: 'Spicy Zinger',
        descriptionAr: 'شريحة دجاج حارة مقرمشة مع صوص الباربكيو.',
        descriptionEn: 'Crispy spicy chicken fillet with BBQ sauce.',
        priceMinor: 1700,
        calories: 620,
        image: '/sabah/assets/menu/dish_burger.png',
      },
    ],
  },
  {
    key: 'pizza',
    nameAr: 'البيتزا',
    nameEn: 'Pizza',
    descriptionAr: 'بيتزا إيطالية بعجينة طازجة وجبنة موزاريلا غنية.',
    descriptionEn: 'Stone-baked pizza with rich melted mozzarella.',
    image: '/sabah/assets/menu/dish_pizza.png',
    items: [
      {
        code: 'PZZ-001',
        nameAr: 'بيتزا مارجريتا',
        nameEn: 'Margherita Pizza',
        descriptionAr: 'جبنة موزاريلا طازجة مع صلصة الطماطم والريحان.',
        descriptionEn: 'Fresh mozzarella with tomato sauce and basil.',
        priceMinor: 2500,
        calories: 820,
        image: '/sabah/assets/menu/dish_pizza.png',
      },
      {
        code: 'PZZ-002',
        nameAr: 'بيتزا بيبروني',
        nameEn: 'Pepperoni Pizza',
        descriptionAr: 'بيبروني لحم بقري مع موزاريلا وصوص خاص.',
        descriptionEn: 'Beef pepperoni with mozzarella and signature sauce.',
        priceMinor: 2900,
        calories: 920,
        image: '/sabah/assets/menu/dish_pizza.png',
      },
    ],
  },
  {
    key: 'potatoes',
    nameAr: 'البطاطس والمقالي',
    nameEn: 'Potatoes & Sides',
    descriptionAr: 'بطاطس مقلية مقرمشة، بالجبنة، وأصابع موزاريلا.',
    descriptionEn: 'Golden fries, cheese fries, and crispy mozzarella sticks.',
    image: '/sabah/assets/menu/dish_potato.png',
    items: [
      {
        code: 'POT-001',
        nameAr: 'بطاطس مقلية',
        nameEn: 'French Fries',
        priceMinor: 700,
        calories: 320,
        image: '/sabah/assets/menu/dish_potato.png',
      },
      {
        code: 'POT-002',
        nameAr: 'بطاطس بالجبنة',
        nameEn: 'Cheese Fries',
        priceMinor: 1100,
        calories: 480,
        image: '/sabah/assets/menu/dish_potato.png',
      },
    ],
  },
  {
    key: 'appetizers',
    nameAr: 'المقبلات والسلطات',
    nameEn: 'Appetizers & Salads',
    descriptionAr: 'مقبلات شامية: حمص، متبل، بابا غنوج، فتوش، تبولة.',
    descriptionEn: 'Levantine dips, salads, and stuffed vine leaves.',
    image: '/sabah/assets/menu/dish_appetizer.png',
    items: [
      {
        code: 'APP-001',
        nameAr: 'حمص',
        nameEn: 'Hummus',
        descriptionAr: 'حمص مهروس مع الطحينة وزيت الزيتون.',
        descriptionEn: 'Blended chickpeas with tahini and olive oil.',
        priceMinor: 900,
        calories: 280,
        image: '/sabah/assets/menu/dish_appetizer.png',
      },
      {
        code: 'APP-002',
        nameAr: 'فتوش',
        nameEn: 'Fattoush',
        descriptionAr: 'سلطة شامية مع خبز محمص ودبس الرمان.',
        descriptionEn: 'Levantine salad with toasted bread and pomegranate molasses.',
        priceMinor: 1200,
        calories: 190,
        image: '/sabah/assets/menu/dish_appetizer.png',
      },
    ],
  },
  {
    key: 'juices',
    nameAr: 'العصائر الطبيعية',
    nameEn: 'Fresh Juices',
    descriptionAr: 'عصائر فواكه طبيعية 100% تحضر عند الطلب.',
    descriptionEn: '100% fresh natural fruit juices made on order.',
    image: '/sabah/assets/menu/dish_juices.png',
    items: [
      {
        code: 'JUI-001',
        nameAr: 'عصير برتقال طازج',
        nameEn: 'Fresh Orange Juice',
        priceMinor: 1000,
        calories: 120,
        image: '/sabah/assets/menu/dish_juices.png',
      },
      {
        code: 'JUI-002',
        nameAr: 'عصير مانجو',
        nameEn: 'Mango Juice',
        priceMinor: 1200,
        calories: 150,
        image: '/sabah/assets/menu/dish_juices.png',
      },
    ],
  },
  {
    key: 'beverages',
    nameAr: 'المشروبات والإضافات',
    nameEn: 'Beverages & Extras',
    descriptionAr: 'مشروبات باردة منعشة وإضافات الثومية والحمص.',
    descriptionEn: 'Refreshing cold drinks and signature extras.',
    items: [
      {
        code: 'BEV-001',
        nameAr: 'كينزا',
        nameEn: 'Kinza',
        priceMinor: 300,
        calories: 110,
      },
      {
        code: 'BEV-002',
        nameAr: 'ماء',
        nameEn: 'Water',
        priceMinor: 200,
        calories: 0,
      },
      {
        code: 'BEV-003',
        nameAr: 'ثومية إضافية',
        nameEn: 'Extra Garlic Sauce',
        priceMinor: 200,
        image: '/sabah/assets/menu/dish_appetizer.png',
      },
    ],
  },
];
