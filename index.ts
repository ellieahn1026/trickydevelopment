import index from "./index.html";
import potter from "./potter.html";
import rupin from "./rupin.html";
import tom from "./tom.html";

Bun.serve({
  routes: {
    "/": index,
    "/index.html": index,
    "/potter.html": potter,
    "/rupin.html": rupin,
    "/tom.html": tom,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("hackedGPT → http://localhost:3000");
