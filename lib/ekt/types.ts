export type ProductCharacteristic = {
  name: string;
  value: string;
};

export type ProductCertificate = {
  name: string;
  url: string | null;
};

export type EktStoreStock = {
  id: string | null;
  name: string;
  stock: number | null;
};

export type EktProduct = {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  price: number | null;
  currency: string | null;
  stock: number | null;
  available: boolean | null;
  characteristics: ProductCharacteristic[];
  certificates: ProductCertificate[];
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  stores: EktStoreStock[];
  recommendedProductIds: string[];
};

export type ProductsPage = {
  products: EktProduct[];
  page: number;
  totalPages: number | null;
  total: number | null;
  hasNextPage: boolean | null;
  perPage: number | null;
};
