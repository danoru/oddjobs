import Link from "next/link";

/** A member's name, linking to their WANTED poster (/u/<username>). Profiles are for members, so only link where a member is looking. */
export function ProfileLink({ person, className, children }: { person: { username: string; displayName: string }; className?: string; children?: React.ReactNode }) {
  return (
    <Link href={`/u/${encodeURIComponent(person.username)}`} prefetch={false} className={className}>
      {children ?? person.displayName}
    </Link>
  );
}
