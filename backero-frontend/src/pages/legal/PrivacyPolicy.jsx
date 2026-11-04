export default function PrivacyPolicy() {
  return (
    <div style={{ background: '#faf8f3', minHeight: '100vh', padding: '56px 24px 96px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 28, fontWeight: 700, color: '#4b7320', marginBottom: 24,
          }}
        >
          🌿 Backero
        </div>

        <h1 style={{ fontSize: 34, fontWeight: 700, color: '#262420', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
          Privacy Policy
        </h1>
        <p style={{ color: '#5b564c', fontSize: 14, margin: '0 0 36px' }}>Last updated: 4 November 2026</p>

        <div
          style={{
            background: '#fff', border: '1px solid #e4ddcf', borderRadius: 14,
            padding: '40px 44px', color: '#262420', lineHeight: 1.65, fontSize: 15.5,
          }}
        >
          <Section title="Who we are" first>
            <p>
              Backero Private Limited (&quot;Backero&quot;, &quot;we&quot;, &quot;us&quot;) operates an internal
              enterprise operations platform used by our own staff to manage tasks, customer relationships (CRM),
              production, inventory, finance, and customer communications for our cosmetics manufacturing business
              (brands: Treyfa, Kymarie).
            </p>
          </Section>

          <Section title="What this policy covers">
            <p>
              This policy covers data processed by Backero&apos;s internal workflow platform, including its use of
              the WhatsApp Business Platform (via Meta&apos;s Cloud API) to communicate with customers and to back
              up business WhatsApp conversations for customer service and record-keeping.
            </p>
          </Section>

          <Section title="What data we collect and why">
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li style={{ marginBottom: 8 }}>
                <strong>WhatsApp messages on our business numbers.</strong> Conversations between our customers and
                our business WhatsApp numbers are stored so our team can review customer history, respond
                consistently, and keep a record of commitments made to customers. This includes message text,
                timestamps, and the customer&apos;s WhatsApp number.
              </li>
              <li style={{ marginBottom: 8 }}>
                <strong>Customer contact details.</strong> Name, phone number, and related business details (e.g.
                company, order history) entered by our staff or shared by the customer.
              </li>
              <li>
                <strong>Staff account data.</strong> Name, email, and role, used to control access to the platform.
              </li>
            </ul>
          </Section>

          <Section title="How we use this data">
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li style={{ marginBottom: 8 }}>To respond to customer enquiries and provide customer support.</li>
              <li style={{ marginBottom: 8 }}>
                To maintain an internal record of customer conversations tied to their account or order in our CRM.
              </li>
              <li style={{ marginBottom: 8 }}>
                To generate internal summaries of customer conversations for our sales and production teams, using
                an AI summarisation service.
              </li>
              <li>
                To send customers order and service updates via WhatsApp, where they have an existing conversation
                with us.
              </li>
            </ul>
          </Section>

          <Section title="Who can access this data">
            <p>
              Only authorised Backero staff (managers and above, or staff explicitly granted access) can view
              customer WhatsApp conversations. Data is not sold or shared with third parties for marketing purposes.
            </p>
          </Section>

          <Section title="Data storage and security">
            <p>
              Data is stored on secured, access-controlled infrastructure (MongoDB Atlas) and our application
              servers. Access requires authentication and is scoped to our organisation only.
            </p>
          </Section>

          <Section title="Data retention">
            <p>
              We retain customer conversation data for as long as needed to support the customer relationship and
              our business record-keeping obligations.
            </p>
          </Section>

          <Section title="Your rights">
            <p>To request access to, correction of, or deletion of your data, contact us using the details below.</p>
          </Section>

          <Section title="Contact">
            <div style={{ background: '#e7eedb', borderRadius: 10, padding: '18px 20px' }}>
              <p style={{ margin: 0 }}>
                <strong>Backero Private Limited</strong>
                <br />
                Email:{' '}
                <a href="mailto:backeroindia@gmail.com" style={{ color: '#4b7320', fontWeight: 600 }}>
                  backeroindia@gmail.com
                </a>
                <br />
                Website:{' '}
                <a href="https://backero.in" style={{ color: '#4b7320', fontWeight: 600 }}>
                  backero.in
                </a>
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, first }) {
  return (
    <div style={{ marginTop: first ? 0 : 36, paddingTop: first ? 0 : 22, borderTop: first ? 'none' : '1px solid #e4ddcf' }}>
      <h2 style={{ fontSize: 19, fontWeight: 600, color: '#4b7320', margin: '0 0 10px' }}>{title}</h2>
      {children}
    </div>
  );
}
