import React from "react";
import { Link } from "react-router-dom";
import SiteNav from "../components/SiteNav.jsx";
import FooterSection from "../sections/FooterSection.jsx";
import qr from '.././../Assets/SharedScreenshot.jpg'
const dailyQuestions = [
  {
    label: "Queue",
    title: "How long is the line right now?",
    copy:
      "Managers can see the waiting count, the estimated delay, and the next action to take without leaving the owner view.",
    points: [
      "Track queue pressure before drivers start asking for updates",
      "Call the next customer from the same workflow when things slow down"
    ]
  },
  {
    label: "Fuel & Stock",
    title: "Do we still have enough fuel for the rest of the shift?",
    copy:
      "Fuel stock stays visible alongside the station status, so owners do not have to chase numbers through calls or chat messages.",
    points: [
      "Update live liters for gasoline, diesel, and other fuel types",
      "Spot weak stock positions early enough to react calmly"
    ]
  },
  {
    label: "Cashflow",
    title: "Do the payments and payouts make sense?",
    copy:
      "The console keeps provider totals, platform fees, and station payout expectations close to the rest of the day-to-day picture.",
    points: [
      "Review daily payment activity without opening separate tools",
      "Close the day with fewer surprises around money movement"
    ]
  }
];

const stationDay = [
  {
    time: "06:15",
    title: "Open the station with the basics in order",
    copy:
      "Start by confirming stock, checking the station profile, and making sure the right team members have access before the day gets busy.",
    points: ["Fuel levels", "Station status", "Team access"]
  },
  {
    time: "11:40",
    title: "Handle the rush while people are still patient",
    copy:
      "When queues tighten, the owner view makes it easier to see the slowdown, support the manager, and move the line without guesswork.",
    points: ["Queue health", "Call next", "Live station pulse"]
  },
  {
    time: "16:30",
    title: "Check the money before close-out pressure starts",
    copy:
      "Payments, payout estimates, and exceptions are easier to understand when they live in the same place as the rest of station operations.",
    points: ["Payment totals", "Provider mix", "Expected payout"]
  },
  {
    time: "20:10",
    title: "Finish the day cleanly, not with loose ends",
    copy:
      "Review promotions, export reports, and clean up user access so the next shift is not inheriting avoidable problems.",
    points: ["Reports", "Promotions", "Account control"]
  }
];

const workspaceGroups = [
  {
    title: "Customer flow",
    intro: "Keep the forecourt moving when demand suddenly spikes.",
    items: [
      "Queue snapshot with waiting count and estimated delay",
      "Quick call-next action for the active station",
      "A calmer way to understand where pressure is building"
    ]
  },
  {
    title: "Station readiness",
    intro: "Know what the station can actually deliver right now.",
    items: [
      "Fuel and stock visibility by station",
      "Station profile, payment details, and operational status",
      "One place to update what customers and staff depend on"
    ]
  },
  {
    title: "Money and accountability",
    intro: "Make end-of-day review less messy for everyone involved.",
    items: [
      "Payment activity and payout math in one workflow",
      "Promotion control without digging through separate admin pages",
      "Team management, blocking, and session control when needed"
    ]
  }
];

const roles = [
  {
    label: "Owner / Org Admin",
    title: "For the person responsible for the whole network",
    copy:
      "See station health, compare locations, and step in quickly when queues, stock, or payouts start drifting.",
    list: ["Multi-station visibility", "Operational checks", "Fewer reactive phone calls"]
  },
  {
    label: "Station Manager",
    title: "For the person keeping one site running all day",
    copy:
      "Move the queue, update fuel stock, manage the team, and keep station details accurate without bouncing across disconnected tools.",
    list: ["Queue actions", "Fuel updates", "Team and settings control"]
  },
  {
    label: "Super Admin",
    title: "For setup, oversight, and account control",
    copy:
      "Manage organizations, stations, and admin access in the same system used for daily operational review.",
    list: ["Station setup", "Role management", "Access cleanup when needed"]
  }
];

const faqs = [
  {
    question: "Can we start with one station first?",
    answer:
      "Yes. The owner console already supports a single-station workflow, and the structure also works as you add more locations later."
  },
  {
    question: "Does each person need their own login?",
    answer:
      "Yes. The product is built around role-based access so owners, managers, and other team members can see the parts that match their responsibility."
  },
  {
    question: "Can managers update payment details and station information?",
    answer:
      "Yes. Station details, payment setup, fuel status, and team settings are part of the existing owner workflow."
  },
  {
    question: "Do we have to replace every tool we use today?",
    answer:
      "No. The current experience is strongest when it becomes the shared place for queue, stock, payment, and team visibility, while reports and exports support the rest of your process."
  }
];

const workspaceTabs = [
  "Command Center",
  "Queue",
  "Fuel & Stock",
  "Cashflow",
  "Pricing",
  "Reports",
  "Team",
  "Station Settings"
];

export default function LandingPage() {
  return (
    <div className="landing landing-home">
      <SiteNav />
      <main className="home-main">
        <section className="home-hero" id="top">
          <div className="home-hero-shell">
            <div className="home-hero-copy">
              <p className="home-kicker">FuelFinder Owner</p>
              <h1>Know what is happening at every station before someone has to call you.</h1>
              <p className="home-lead">
                FuelFinder Owner turns the noisy parts of station operations into one calm screen:
                queue flow, fuel stock, payments, team access, and station details.
              </p>
              <div className="home-actions">
                <Link className="primary-btn" to="/app">
                  Open Owner Console
                </Link>
                <a className="secondary-btn" href="#operations">
                  See the daily flow
                </a>
              </div>
              <div className="home-chip-row" aria-label="Core owner workflows">
                <span className="home-chip">Queue</span>
                <span className="home-chip">Fuel & Stock</span>
                <span className="home-chip">Cashflow</span>
                <span className="home-chip">Pricing</span>
                <span className="home-chip">Team</span>
                <span className="home-chip">Station Settings</span>
              </div>
            </div>

            <div className="home-hero-stack">
              <article className="home-board">
                <div className="home-board-head">
                  <div>
                    <span className="home-board-tag">Example station view</span>
                    <h2 >Bole Road Station</h2>
                  </div>
                  {/* <p className="home-board-tag">Tuesday, 11:40 AM</p> */}
                </div>

                <div className="home-board-grid">
                  <article className="home-board-card">
                    <h1>Queue</h1>
                    <small>18 waiting</small>
                    <div className="home-board-list">
                      <small>Average wait: 11 minutes</small>
                      <small>Next ticket ready to call</small>
                    </div>
                  </article>

                  <article className="home-board-card">
                    <span>Fuel</span>
                    <strong>14,520 L</strong>
                    <div className="home-board-list">
                      <small>Gasoline: 8,400 L</small>
                      <small>Diesel: 6,120 L</small>
                    </div>
                  </article>

                  <article className="home-board-card">
                    <span>Payments</span>
                    <strong>ETB 60,800</strong>
                    <div className="home-board-list">
                      <small>Telebirr and any Ethiopian bank </small>
                      <small>Payout estimate ready to review</small>
                    </div>
                  </article>

                  <article className="home-board-card">
                    <span>Team</span>
                    <strong>6 on shift</strong>
                    <div className="home-board-list">
                      <small>Roles match today&apos;s operations</small>
                      <small>Account cleanup stays in reach</small>
                    </div>
                  </article>
                </div>
              </article>

              <aside className="home-note">
                <p className="home-note-label">What a manager checks first</p>
                <ul>
                  <li>Is the queue stretching longer than normal?</li>
                  <li>Are gasoline and diesel levels still healthy for the shift?</li>
                  <li>Will close-out be clean, or are payments already drifting?</li>
                </ul>
              </aside>
            </div>
          </div>
        </section>

        <section className="home-section home-strip" aria-label="Landing page summary">
          <article className="home-strip-card">
            <span>Less noise</span>
            <strong>A calmer owner view</strong>
            <p>Designed around the checks people actually make during the day.</p>
          </article>
          <article className="home-strip-card">
            <span>More control</span>
            <strong>Action close to the data</strong>
            <p>Queue, stock, cashflow, and team management live side by side.</p>
          </article>
          <article className="home-strip-card">
            <span>Better close-out</span>
            <strong>Fewer end-of-day surprises</strong>
            <p>Payment review and reporting stay near the operational picture.</p>
          </article>
        </section>

        <section className="home-section" id="features">
          <div className="home-section-header">
            <span className="eyebrow">Built Around Real Questions</span>
            <h2>The screen follows the questions owners ask in real life.</h2>
            <p className="vague" >
              Not vague dashboard language. Just the checks people make when the station gets busy,
              stock feels tight, or the numbers start looking strange.
            </p>
          </div>

          <div className="home-question-grid">
            {dailyQuestions.map((item) => (
              <article key={item.title} className="home-question-card">
                <span className="home-question-label">{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <ul>
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section" id="operations">
          <div className="home-section-header">
            <span className="eyebrow">A Better Rhythm</span>
            <h2>From opening shift to close-out, the page keeps the day readable.</h2>
            <p className="goal">
              The goal is not more widgets. It is giving owners and managers and city manager  one place to see what
              needs attention before a small issue becomes a noisy one.
            </p>
          </div>

          <div className="home-flow-layout">
            <div className="home-flow-list">
              {stationDay.map((item) => (
                <article key={`${item.time}-${item.title}`} className="home-flow-item">
                  <div className="home-flow-time">{item.time}</div>
                  <div className="home-flow-body">
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                    <div className="home-flow-points">
                      {item.points.map((point) => (
                        <span key={point}>{point}</span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <aside className="home-aside">
              <span className="home-aside-label">Why this feels more human</span>
              <h3>It helps people intervene early, not explain things later.</h3>
              <p>
                Queue trouble, low stock, payout review, promotions, and user access all belong to
                the same working day. The landing page now tells that story directly.
              </p>
              <ul>
                <li>Support the queue while the issue is still manageable</li>
                <li>See fuel updates without waiting for another spreadsheet</li>
                <li>Review money movement before close-out gets stressful</li>
                <li>Clean up roles and sessions without leaving the workspace</li>
              </ul>
            </aside>
          </div>
        </section>

        <section className="home-section" id="insights">
          <div className="home-section-header">
            <span className="eyebrow">One Workspace</span>
            <h2>Everything important lives in one owner workflow, not ten separate tabs.</h2>
            <small className="console">
              The console already has real operational depth. This new landing page shows that more
              honestly, with clearer structure and less startup-template polish.
            </small>
          </div>

          <div className="home-workspace-grid">
            {workspaceGroups.map((group) => (
              <article key={group.title} className="home-workspace-card">
                <h3>{group.title}</h3>
                <p>{group.intro}</p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="home-tab-row" aria-label="Owner console sections">
            {workspaceTabs.map((tab) => (
              <span key={tab}>{tab}</span>
            ))}
          </div>
        </section>

        <section className="home-section">
          <div className="home-section-header">
            <span className="eyebrow">Shared Ownership</span>
            <h2 >Made for the people who actually get the calls.</h2>
            <small
            >
              Owners, station managers, and admin teams all need the same source of truth, but not
              the same level of access. The product already supports that, and the page should say
              it plainly.
            </small>
          </div>

          <div className="home-role-grid">
            {roles.map((role) => (
              <article key={role.title} className="home-role-card">
                <span className="home-role-label">{role.label}</span>
                <h3>{role.title}</h3>
                <p>{role.copy}</p>
                <ul>
                  {role.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section home-faq">
          <div className="home-section-header">
            <span className="eyebrow">FAQ</span>
            <h2>Short answers to the practical questions.</h2>
            <small>
              The page should help someone understand the product quickly, without making them read
              through inflated claims.
            </small>
          </div>

          <div className="home-faq-grid">
            {faqs.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="home-section home-cta" id="contact">
          <div className="home-cta-card">
            <div>
              <span className="eyebrow">Start Simply</span>
              <h2>Start with one station, then grow when the team is ready.</h2>
              <small>
                You do not need a giant rollout to get value from a calmer owner view. Open the
                console now, or talk with the team about how your stations are set up today.
              </small>
            </div>

            <div className="home-cta-actions">
              <Link className="primary-btn" to="/app">
                Open Owner Console
              </Link>
              <a className="secondary-btn" href="mailto:mintesenotbizuayehw@gmail.com">
                Email the team
              </a>
            </div>
          </div>
        </section>

        <section className="home-section home-cta" id="customer-app">
          <div className="home-cta-card">
            <div>
              <span className="eyebrow"> download customer App here</span>
              <h1>  create Account  and find ur faviourte Stations Fuel either EV station.</h1>
              <small className="customerapp">
                <ul className="customerapps">
                  <li>create account</li>
                  <li>Gps Access</li>
                  <li>find Ev or Fuel Stations</li>
                  <li> Reserve Queue  remotely  </li>
                  <li> Pay for stations digitally </li>
                  <li> track queue</li>
                  <li> Notofications Avilabe , turn now </li>
                </ul>
              </small>
            </div>

            <div className="home-cta-actions">
             <img src={qr} alt="FuelFinder customer app download QR code" />
             {/* <p>dowloand</p> */}
            </div>
          </div>
        </section>
      </main>
      <FooterSection />
    </div>
  );
}

