import logo from "../public/cassis.png";
import "./mock-api.js";
window.__CASSIS_LOGO__ = logo;
document.querySelector("link[rel=icon]")?.setAttribute("href", logo);
await import("../src/main.jsx");
