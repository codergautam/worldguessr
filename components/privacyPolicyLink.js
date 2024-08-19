import Link from "next/link";

export default function PrivacyPolicyLink() {
  return (
    <div className="privacyPolicyLink">
      <Link target="_blank" href="/privacy">Privacy Policy</Link>
    </div>
  );
}