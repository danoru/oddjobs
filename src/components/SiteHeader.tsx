import Link from "next/link";
import { useRouter } from "next/router";
import { signOut } from "next-auth/react";
import { Box, Button, Typography } from "@mui/material";
import { ReadingMenu } from "@/components/reading/ReadingMenu";
import { useWhoami } from "@/lib/useWhoami";

/** The hanging tavern sign. `reading` adds the reading-modes menu, on pages that show sheets. */
export function SiteHeader({ back, reading = false }: { back?: { href: string; label: string }; reading?: boolean }) {
  const router = useRouter();
  const who = useWhoami(router.pathname);
  const user = who?.user;
  return (
    <>
      {/* The skip link is the app's first element (src/pages/_app.tsx), ahead of the GM bar. */}
      <Box
        component="header"
        className="no-print"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
          py: 2.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
          <Link href="/board" style={{ textDecoration: "none" }} aria-label="Oddjobs: back to the board">
            <Typography
              component="span"
              variant="h1"
              sx={{
                display: "inline-block",
                fontSize: { xs: 28, sm: 34 },
                color: "primary.main",
                px: 2,
                py: 0.5,
                border: "3px solid",
                borderColor: "#6b4425",
                background: "linear-gradient(180deg, #4a2e18, #35200f)",
                boxShadow: "0 6px 14px rgba(0,0,0,0.5)",
                textShadow: "0 2px 0 #1c140e",
              }}
            >
              Oddjobs
            </Typography>
          </Link>
          {back && (
            <Button component={Link} href={back.href} size="small" sx={{ color: "text.secondary" }}>
              ← {back.label}
            </Button>
          )}
        </Box>
        <Box component="nav" aria-label="Your account" sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          {reading && <ReadingMenu />}
          {/* Admins have the GM bar; an author's way into the builder is here. */}
          {user?.author && user.role !== "admin" && (
            <Button component={Link} href="/admin" prefetch={false} size="small" sx={{ color: "text.secondary" }}>
              Builder
            </Button>
          )}
          {user && (
            <Button component={Link} href="/settings" prefetch={false} size="small" sx={{ color: "text.secondary" }} title="Your settings">
              {user.displayName}
            </Button>
          )}
          <Button size="small" sx={{ color: "text.secondary" }} onClick={() => void signOut({ redirectTo: "/" })}>
            Leave the tavern
          </Button>
        </Box>
      </Box>
    </>
  );
}
