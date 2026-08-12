/** Inline FOUC guard for RootLayout — must stay free of "use client". */
export const THEME_STORAGE_KEY = "buddy.theme";

export const THEME_FOUC_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="dark"&&t!=="light")t="light";var d=document.documentElement;d.classList.toggle("dark",t==="dark");d.style.colorScheme=t;}catch(e){}})();`;
