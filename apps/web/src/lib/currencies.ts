/**
 * ISO 4217 currency data — replaces the `currency-codes` npm package.
 * Format matches the `currency-codes` library: { code, currency, countries }.
 */
export interface CurrencyEntry {
  code: string;
  currency: string;
  countries: string[];
}

export const currencies: CurrencyEntry[] = [
  { code: 'USD', currency: 'US Dollar', countries: ['United States'] },
  { code: 'EUR', currency: 'Euro', countries: ['European Union'] },
  { code: 'GBP', currency: 'Pound Sterling', countries: ['United Kingdom'] },
  { code: 'JPY', currency: 'Yen', countries: ['Japan'] },
  { code: 'CNY', currency: 'Yuan Renminbi', countries: ['China'] },
  { code: 'KZT', currency: 'Tenge', countries: ['Kazakhstan'] },
  { code: 'RUB', currency: 'Russian Ruble', countries: ['Russia'] },
  { code: 'CAD', currency: 'Canadian Dollar', countries: ['Canada'] },
  { code: 'AUD', currency: 'Australian Dollar', countries: ['Australia'] },
  { code: 'CHF', currency: 'Swiss Franc', countries: ['Switzerland'] },
  { code: 'SEK', currency: 'Swedish Krona', countries: ['Sweden'] },
  { code: 'NOK', currency: 'Norwegian Krone', countries: ['Norway'] },
  { code: 'DKK', currency: 'Danish Krone', countries: ['Denmark'] },
  { code: 'NZD', currency: 'New Zealand Dollar', countries: ['New Zealand'] },
  { code: 'SGD', currency: 'Singapore Dollar', countries: ['Singapore'] },
  { code: 'HKD', currency: 'Hong Kong Dollar', countries: ['Hong Kong'] },
  { code: 'KRW', currency: 'Won', countries: ['South Korea'] },
  { code: 'INR', currency: 'Indian Rupee', countries: ['India'] },
  { code: 'BRL', currency: 'Brazilian Real', countries: ['Brazil'] },
  { code: 'MXN', currency: 'Mexican Peso', countries: ['Mexico'] },
  { code: 'ZAR', currency: 'Rand', countries: ['South Africa'] },
  { code: 'TRY', currency: 'Turkish Lira', countries: ['Turkey'] },
  { code: 'PLN', currency: 'Zloty', countries: ['Poland'] },
  { code: 'CZK', currency: 'Czech Koruna', countries: ['Czech Republic'] },
  { code: 'HUF', currency: 'Forint', countries: ['Hungary'] },
  { code: 'RON', currency: 'Romanian Leu', countries: ['Romania'] },
  { code: 'ILS', currency: 'New Israeli Sheqel', countries: ['Israel'] },
  { code: 'SAR', currency: 'Saudi Riyal', countries: ['Saudi Arabia'] },
  { code: 'AED', currency: 'UAE Dirham', countries: ['United Arab Emirates'] },
  { code: 'QAR', currency: 'Qatari Rial', countries: ['Qatar'] },
  { code: 'EGP', currency: 'Egyptian Pound', countries: ['Egypt'] },
  { code: 'NGN', currency: 'Naira', countries: ['Nigeria'] },
  { code: 'PKR', currency: 'Pakistan Rupee', countries: ['Pakistan'] },
  { code: 'BDT', currency: 'Taka', countries: ['Bangladesh'] },
  { code: 'VND', currency: 'Dong', countries: ['Vietnam'] },
  { code: 'THB', currency: 'Baht', countries: ['Thailand'] },
  { code: 'MYR', currency: 'Malaysian Ringgit', countries: ['Malaysia'] },
  { code: 'IDR', currency: 'Rupiah', countries: ['Indonesia'] },
  { code: 'PHP', currency: 'Philippine Peso', countries: ['Philippines'] },
  { code: 'UAH', currency: 'Hryvnia', countries: ['Ukraine'] },
  { code: 'GEL', currency: 'Lari', countries: ['Georgia'] },
  { code: 'AMD', currency: 'Armenian Dram', countries: ['Armenia'] },
  { code: 'AZN', currency: 'Azerbaijan Manat', countries: ['Azerbaijan'] },
  { code: 'UZS', currency: 'Uzbekistan Sum', countries: ['Uzbekistan'] },
  { code: 'KGS', currency: 'Som', countries: ['Kyrgyzstan'] },
  { code: 'TJS', currency: 'Somoni', countries: ['Tajikistan'] },
  { code: 'TMT', currency: 'Turkmenistan New Manat', countries: ['Turkmenistan'] },
  { code: 'MDL', currency: 'Moldovan Leu', countries: ['Moldova'] },
  { code: 'BYN', currency: 'Belarusian Ruble', countries: ['Belarus'] },
];

/** Drop-in replacement for `currency-codes` default export shape */
const currencyCodesCompat = {
  data: currencies,
  code: (code: string) => currencies.find((c) => c.code === code) ?? null,
};

export default currencyCodesCompat;
