"use client";

import dynamic from "next/dynamic";

function StoriesViewerRegistration() {
  return null;
}

const RegisterStoriesViewer = dynamic(
  () =>
    import("@stories/stories-embed/register").then(
      () => StoriesViewerRegistration,
    ),
  { ssr: false },
);

const manifestUrl = "http://127.0.0.1:4173/stories.json";

export default function Home() {
  return (
    <main>
      <h1>Stories Next demo</h1>
      <RegisterStoriesViewer />
      <stories-viewer manifest-url={manifestUrl} />
    </main>
  );
}
