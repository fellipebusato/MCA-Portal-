// components/Footer.tsx
import { PORTAL, CONTACT } from "@/lib/config";

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white mt-auto">
      <div className="mx-auto max-w-6xl px-6 py-4">
        <p className="text-center text-[10px] text-gray-300 leading-relaxed">
          {PORTAL.disclaimer}
        </p>
        <p className="text-center text-[10px] text-gray-300 mt-1">
          {PORTAL.name} · Personal service by {CONTACT.name} · {CONTACT.email} · {CONTACT.phone}
        </p>
      </div>
    </footer>
  );
}