import { redirect } from "next/navigation";

// Stories now live in the Story Bank library.
export default function StoriesPage() {
  redirect("/library");
}
