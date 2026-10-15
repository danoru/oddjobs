import Link from "next/link";
import { Box, Button, Typography } from "@mui/material";

/** The hanging tavern sign. */
export function SiteHeader({ back }: { back?: { href: string; label: string } }) {
  return (
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
        <Link href="/" style={{ textDecoration: "none" }}>
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
      <Button component="a" href="/api/logout" size="small" sx={{ color: "text.secondary" }}>
        Leave the tavern
      </Button>
    </Box>
  );
}
