import Link from "next/link";
import { Box, Button, Typography } from "@mui/material";
import { ReadingMenu } from "@/components/reading/ReadingMenu";

/** The hanging tavern sign. `reading` adds the reading-modes menu, on pages that show sheets. */
export function SiteHeader({ back, reading = false }: { back?: { href: string; label: string }; reading?: boolean }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to the page
      </a>
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
          <Link href="/" style={{ textDecoration: "none" }} aria-label="Tear-Off: back to the board">
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
              Tear-Off
            </Typography>
          </Link>
          {back && (
            <Button component={Link} href={back.href} size="small" sx={{ color: "text.secondary" }}>
              ← {back.label}
            </Button>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {reading && <ReadingMenu />}
          <Button component="a" href="/api/logout" size="small" sx={{ color: "text.secondary" }}>
            Leave the tavern
          </Button>
        </Box>
      </Box>
    </>
  );
}
