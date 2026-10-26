// A setup link cut short (the token lost when it wrapped onto a new line) lands here. Send
// them to sign in rather than a 404; a bad link already behaves the same way (D26, BR-4).

import { redirect } from "next/navigation";

export default function SetupWithoutToken() {
  redirect("/admin/login");
}
