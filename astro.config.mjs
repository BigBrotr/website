import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightBlog from "starlight-blog";

export default defineConfig({
  site: "https://bigbrotr.com",
  integrations: [
    starlight({
      title: "BigBrotr",
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
      editLink: {
        baseUrl: "https://github.com/BigBrotr/website/edit/main/",
      },
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
            { label: "Introduction", slug: "getting-started/introduction" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
            { label: "Installation", slug: "getting-started/installation" },
          ],
        },
        {
          label: "Architecture",
          items: [
            { label: "Overview", slug: "architecture/overview" },
            { label: "Package Structure", slug: "architecture/packages" },
            { label: "Data Flow", slug: "architecture/data-flow" },
          ],
        },
        {
          label: "Services",
          items: [
            { label: "Overview", slug: "services/overview" },
            { label: "Seeder", slug: "services/seeder" },
            { label: "Finder", slug: "services/finder" },
            { label: "Validator", slug: "services/validator" },
            { label: "Monitor", slug: "services/monitor" },
            { label: "Refresher", slug: "services/refresher" },
            { label: "Synchronizer", slug: "services/synchronizer" },
          ],
        },
        {
          label: "Database",
          items: [
            { label: "Schema", slug: "database/schema" },
            { label: "Stored Procedures", slug: "database/procedures" },
            { label: "Materialized Views", slug: "database/views" },
          ],
        },
        {
          label: "Configuration",
          items: [
            { label: "Overview", slug: "configuration/overview" },
            { label: "Core", slug: "configuration/core" },
            { label: "Services", slug: "configuration/services" },
            { label: "Deployments", slug: "configuration/deployments" },
          ],
        },
        {
          label: "NIPs",
          items: [
            {
              label: "NIP-11: Relay Information",
              slug: "nips/nip-11",
            },
            {
              label: "NIP-66: Relay Monitoring",
              slug: "nips/nip-66",
            },
          ],
        },
        {
          label: "Development",
          items: [
            { label: "Contributing", slug: "development/contributing" },
            { label: "Testing", slug: "development/testing" },
          ],
        },
        {
          label: "Resources",
          items: [{ label: "FAQ", slug: "resources/faq" }],
        },
      ],
    }),
  ],
});
