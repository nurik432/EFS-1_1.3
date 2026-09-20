// Сумма в русском формате: «18 750,00», «-1 500,00».
// Запятая и обычный пробел вставляются в Excel как число, в отличие от «2000.00».
export const formatAmount = (value: number): string => {
  const [int, frac] = Math.abs(value).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const isZero = int === '0' && frac === '00';
  return `${value < 0 && !isZero ? '-' : ''}${grouped},${frac}`;
};

const pad = (n: number) => String(n).padStart(2, '0');

export const formatTime = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatDateTime = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${formatTime(ms)}`;
};

export const formatElapsed = (ms: number): string =>
  ms < 100 ? '< 0,1 с' : `${(ms / 1000).toFixed(1).replace('.', ',')} с`;
