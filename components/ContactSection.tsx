import { CONTACT_ROUTES } from "@/lib/booking";

const MailIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M2 4.5 L8 8.5 L14 4.5" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

/**
 * Dedicated "Get in touch" contact section. Pure/presentational so it can be
 * rendered from both server pages (/contact) and the client /book page.
 * All channels are clickable mailto: links on the production domain.
 */
export function ContactSection({ id = "contact" }: { id?: string }) {
  return (
    <section className="section section--tight" id={id} data-screen-label="Contact">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Contact</span>
          <h2>Get in touch.</h2>
          <p>
            Whether you&rsquo;re exploring enterprise deployment, runtime governance
            pilots, research collaboration, licensing opportunities, media interviews,
            or strategic partnerships, we&rsquo;d love to hear from you.
          </p>
        </div>
        <div className="contact-grid contact-grid--six">
          {CONTACT_ROUTES.map((c, i) => (
            <a
              className="contact-card card reveal"
              href={`mailto:${c.email}`}
              key={c.email}
              data-d={i > 0 ? String(Math.min(i, 5)) : undefined}
            >
              <div className="contact-label">{c.label}</div>
              <div className="contact-desc">{c.description}</div>
              <span className="contact-email">
                <span className="contact-email-ic"><MailIcon /></span>
                {c.email}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
