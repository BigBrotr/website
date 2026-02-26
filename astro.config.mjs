import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightBlog from "starlight-blog";

export default defineConfig({
  site: "https://bigbrotr.com",
  integrations: [
    starlight({
      title: "BigBrotr",
      favicon: "/favicon.png",
      logo: {
        src: "./src/assets/logo.webp",
        replacesTitle: true,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/BigBrotr/bigbrotr",
        },
      ],
      components: {
        Header: "./src/components/Header.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
        MobileMenuFooter: "./src/components/MobileMenuFooter.astro",
      },
      customCss: ["./src/styles/custom.css"],
      plugins: [
        starlightBlog({
          title: "Blog",
          authors: {
            bigbrotr: {
              name: "BigBrotr",
              title: "Core Team",
              url: "https://github.com/BigBrotr",
            },
          },
        }),
      ],
      head: [
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://bigbrotr.com/og-image.png",
          },
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "docs/getting-started/introduction" },
            { label: "Quick Start", slug: "docs/getting-started/quick-start" },
            { label: "Installation", slug: "docs/getting-started/installation" },
          ],
        },
        {
          label: "Architecture",
          items: [
            { label: "Overview", slug: "docs/architecture/overview" },
            { label: "Package Structure", slug: "docs/architecture/packages" },
            { label: "Data Flow", slug: "docs/architecture/data-flow" },
          ],
        },
        {
          label: "Services",
          items: [
            { label: "Overview", slug: "docs/services/overview" },
            { label: "Seeder", slug: "docs/services/seeder" },
            { label: "Finder", slug: "docs/services/finder" },
            { label: "Validator", slug: "docs/services/validator" },
            { label: "Monitor", slug: "docs/services/monitor" },
            { label: "Refresher", slug: "docs/services/refresher" },
            { label: "Synchronizer", slug: "docs/services/synchronizer" },
          ],
        },
        {
          label: "Database",
          items: [
            { label: "Schema", slug: "docs/database/schema" },
            { label: "Stored Functions", slug: "docs/database/procedures" },
            { label: "Materialized Views", slug: "docs/database/views" },
          ],
        },
        {
          label: "Configuration",
          items: [
            { label: "Overview", slug: "docs/configuration/overview" },
            { label: "Core", slug: "docs/configuration/core" },
            { label: "Services", slug: "docs/configuration/services" },
            { label: "Deployments", slug: "docs/configuration/deployments" },
          ],
        },
        {
          label: "NIPs",
          items: [
            {
              label: "NIP-11: Relay Information",
              slug: "docs/nips/nip-11",
            },
            {
              label: "NIP-66: Relay Monitoring",
              slug: "docs/nips/nip-66",
            },
          ],
        },
        {
          label: "Development",
          items: [
            { label: "Contributing", slug: "docs/development/contributing" },
            { label: "Testing", slug: "docs/development/testing" },
          ],
        },
        {
          label: "Resources",
          items: [{ label: "FAQ", slug: "docs/resources/faq" }],
        },
      ],
    }),
  ],
});
