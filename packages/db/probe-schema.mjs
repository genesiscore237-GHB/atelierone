import { db } from "./src/client";
(async () => {
  try {
    const t = await db.execute(sqlRaw);
  } catch (e) {
    console.log("ERR:", e.message);
  }
})();
