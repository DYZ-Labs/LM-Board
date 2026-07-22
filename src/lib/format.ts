const priceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const subDollarPriceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(price: number) {
  return price < 1
    ? subDollarPriceFormatter.format(price)
    : priceFormatter.format(price);
}
