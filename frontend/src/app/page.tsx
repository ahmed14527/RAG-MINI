import { connection } from "next/server";

import App from "@/components/App";

export default async function Page() {
  // Read at request time (not build time) so one image works with any backend URL.
  await connection();
  const apiUrl = process.env.API_URL || "http://localhost:8000";
  return <App apiUrl={apiUrl} />;
}
