// Runs in <head> before the first paint, so the page never flashes the wrong theme.
// Dark unless the person picked Light, or "Match my phone" and the phone is in light mode.
export const THEME_KEY = "wasl.theme";
export const themeScript = `(function(){var d=true;try{var c=localStorage.getItem("${THEME_KEY}");d=c==="light"?false:c==="system"?window.matchMedia("(prefers-color-scheme: dark)").matches:true}catch(e){}document.documentElement.setAttribute("data-theme",d?"dark":"light")})()`;
