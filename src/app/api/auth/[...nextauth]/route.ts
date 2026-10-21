// Auth.js's own routes (sign-in, sign-out, the session, CSRF). Its handlers
// take a web Request, so they live in the App Router; everything else on the
// site is the Pages Router.
import { handlers } from "@/lib/nextAuth";

export const { GET, POST } = handlers;
