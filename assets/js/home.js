/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HFC Exchange - Home/Landing Page Controller Module
 * Manages public landing states, dynamic coin pricing ticks, statistics counters,
 * and boots the reusable design system Footer.
 */

import { Footer } from "/components/Footer.js";
import { Toast } from "/components/Toast.js";
import { Loader } from "/components/Loader.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize the reusable design system Footer
  try {
    const footerInstance = new Footer("#footerContainer", {
      companyName: "HFC Exchange Ltd.",
      links: [
        { label: "Privacy Protocol", href: "#" },
        { label: "Terms of Service", href: "#" },
        { label: "Escrow Guidelines", href: "#" },
        { label: "Developer APIs", href: "#" }
      ],
      showTelemetry: true
    });

    // Simulate system ping checks to demonstrate professional integrity
    setInterval(() => {
      const pingVal = Math.floor(Math.random() * 15) + 12; // 12ms - 27ms
      footerInstance.setSystemStatus("online", pingVal);
    }, 4000);
  } catch (err) {
    console.error("Failed to initialize design system Footer:", err);
  }

  // 2. Navigation glass bar transition on scroll
  const navbar = document.getElementById("homeNavbar");
  if (navbar) {
    const handleScroll = () => {
      if (window.scrollY > 30) {
        navbar.classList.add("scrolled");
      } else {
        navbar.classList.remove("scrolled");
      }
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Trigger immediately to capture initial loaded state
  }

  // 3. Highlight navigation link matching visible section
  const navLinks = document.querySelectorAll(".nav-link-hfc");
  const sections = document.querySelectorAll("section, header");
  
  const spySections = () => {
    let currentId = "";
    sections.forEach(section => {
      const sectionTop = section.offsetTop - 120;
      if (window.scrollY >= sectionTop) {
        currentId = section.getAttribute("id") || "";
      }
    });

    navLinks.forEach(link => {
      link.classList.remove("active");
      const href = link.getAttribute("href");
      if (href === `#${currentId}` || (href === "#" && currentId === "hero")) {
        link.classList.add("active");
      }
    });
  };
  window.addEventListener("scroll", spySections);
  spySections();

  // 4. Smooth scrolling behavior for navigation items with proper focus support
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function (e) {
      const hrefValue = this.getAttribute("href");
      if (hrefValue === "#") return; // Keep standard action for top link

      e.preventDefault();
      const targetElement = document.querySelector(hrefValue);
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        // Set keyboard focus for optimal accessibility
        targetElement.setAttribute("tabindex", "-1");
        targetElement.focus({ preventScroll: true });
      }
    });
  });

  // 5. Simulated real-time coin ticker adjustments (representing Firestore sync)
  const priceElements = {
    HFC: { el: document.getElementById("priceHFC"), base: 145.20, precision: 2, unit: "PKR " },
    BTC: { el: document.getElementById("priceBTC"), base: 26782500, precision: 0, unit: "PKR " },
    ETH: { el: document.getElementById("priceETH"), base: 982450, precision: 0, unit: "PKR " },
    USDT: { el: document.getElementById("priceUSDT"), base: 278.45, precision: 2, unit: "PKR " }
  };

  const simulateMarketFluctuation = () => {
    Object.keys(priceElements).forEach(coin => {
      const coinConfig = priceElements[coin];
      if (!coinConfig.el) return;

      // Small fractional variation (-0.05% to +0.05%)
      const percentageChange = (Math.random() * 0.001) - 0.0005;
      coinConfig.base = coinConfig.base * (1 + percentageChange);

      // Render updated formatted currency with localized comma separation
      const formattedPrice = coinConfig.base.toLocaleString("en-US", {
        minimumFractionDigits: coinConfig.precision,
        maximumFractionDigits: coinConfig.precision
      });

      coinConfig.el.textContent = `${coinConfig.unit}${formattedPrice}`;
    });
  };

  // Fluctuate market index prices every 2.5 seconds
  const marketInterval = setInterval(simulateMarketFluctuation, 2500);

  // 6. Stats counters visual increment transition
  const statsElements = [
    { el: document.getElementById("statUsersVal"), suffix: "" },
    { el: document.getElementById("statCoinsVal"), suffix: "" },
    { el: document.getElementById("statTradesVal"), suffix: "" },
    { el: document.getElementById("statOffersVal"), suffix: "" }
  ];

  const animateCounters = () => {
    statsElements.forEach(stat => {
      if (!stat.el) return;
      const target = parseInt(stat.el.getAttribute("data-target"), 10) || 0;
      let current = 0;
      const duration = 1500; // 1.5 seconds total
      const stepTime = Math.max(Math.floor(duration / (target / 100)), 10);
      const stepValue = Math.ceil(target / (duration / stepTime));

      const timer = setInterval(() => {
        current += stepValue;
        if (current >= target) {
          current = target;
          clearInterval(timer);
        }
        stat.el.textContent = current.toLocaleString() + stat.suffix;
      }, stepTime);
    });
  };

  // Intersection Observer to trigger counter animation once visible
  const statsRow = document.getElementById("statsRow");
  if (statsRow) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounters();
          obs.unobserve(entry.target); // Trigger only once
        }
      });
    }, { threshold: 0.2 });

    observer.observe(statsRow);
  }

  // 7. Dynamic Gateway Loaders on "Trade Now" elements and secondary buttons
  const tradeButtons = document.querySelectorAll(".table-glass .btn-hfc, #previewTableBody .btn-hfc");
  tradeButtons.forEach(btn => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      const coinName = this.closest("tr").querySelector(".sticky-ticker span").textContent;
      
      // Use design system Toast & Loader elements programmatically
      Toast.show(`Contacting peer validation node for ${coinName} contract...`, { type: "info", duration: 2500 });
      
      const loader = new Loader({
        text: `Opening gateway connection to secure escrow for ${coinName}...`,
        blurBackdrop: true
      });
      
      loader.show();
      
      setTimeout(() => {
        loader.hide();
        window.location.href = "login.html";
      }, 1500);
    });
  });
});
