import ShantellSans300 from "./ShantellSans-300.ttf";
import ShantellSans500 from "./ShantellSans-500.ttf";
import ShantellSans600 from "./ShantellSans-600.ttf";
import ShantellSans700 from "./ShantellSans-700.ttf";
import ShantellSans800 from "./ShantellSans-800.ttf";
import ShantellSansRegular from "./ShantellSans-regular.ttf";

const fonts = [
  { url: ShantellSans300, weight: "300" },
  { url: ShantellSansRegular, weight: "400" },
  { url: ShantellSans500, weight: "500" },
  { url: ShantellSans600, weight: "600" },
  { url: ShantellSans700, weight: "700" },
  { url: ShantellSans800, weight: "800" },
];

const style = document.createElement("style");
style.textContent = fonts
  .map(
    ({ url, weight }) => `
@font-face {
  font-family: 'Shantell Sans';
  src: url('${url}') format('truetype');
  font-weight: ${weight};
  font-style: normal;
}`,
  )
  .join("\n");
document.head.appendChild(style);

export const shantellSans = "Shantell Sans";
