export const metadata = {
  title: "SiDE AI",
  description: "SiDE AI — Ethiopian AI platform"
};

export default function RootLayout({ children }) {
  return (
    <html lang="am">
      <body>{children}</body>
    </html>
  );
}
