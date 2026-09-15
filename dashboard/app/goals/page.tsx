import { redirect } from "next/navigation";

export default function GoalsRedirectPage() {
  redirect("/dashboard/goals");
}