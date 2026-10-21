import { redirect } from "next/navigation";

// The Personal Profile is now part of the Story Bank library.
export default function ProfilePage() {
  redirect("/library");
}
