interface ProfileSnippet {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export function getDefaultEmailTemplate(profile?: ProfileSnippet): string {
  const name = profile?.name || "[Your Name]";
  const email = profile?.email || "[your@email.com]";
  const phone = profile?.phone || "[your phone]";
  const contact = phone !== "[your phone]" ? `${email}\n${phone}` : email;

  return `Beste [naam],

In de bijlage vindt u mijn CV en motivatiebrief voor de [functie] bij [bedrijf]. Ik ben enthousiast over de mogelijkheid om mee te werken aan [taak], en ik geloof dat mijn achtergrond en projecten goed aansluiten.

Mocht u verdere informatie nodig hebben, hoor ik het graag.

Alvast bedankt voor uw tijd. Ik kijk uit naar uw reactie.

Met vriendelijke groet,
${name}

${contact}`;
}

export function getDefaultLetterTemplate(profile?: ProfileSnippet): string {
  const name = profile?.name || "[Your Name]";
  const email = profile?.email || "[your@email.com]";
  const phone = profile?.phone || "[your phone]";
  const address = profile?.address || "[Your Address]";
  const contact = phone !== "[your phone]" ? `${email}\n${phone}` : email;

  return `${name}
${address}

[Recruitment Team]
[Bedrijf]
Den Haag, NL

Betreft: Sollicitatie [functie]

Beste [naam],

Na het lezen van de vacature voor [functie] bij [bedrijf] was ik direct enthousiast. De combinatie van [aspect van de rol] sluit nauw aan bij mijn achtergrond en praktijkervaring.

Tijdens mijn werkervaring heb ik relevante projecten opgeleverd die aansluiten bij wat [bedrijf] zoekt. Deze ervaringen hebben mij geleerd hoe ik technische oplossingen kan vertalen naar zakelijke waarde.

Wat mij aantrekt in [bedrijf] is [specifiek aspect]. Ik geloof dat mijn aanpak, waarbij ik data en technologie inzet om processen te verbeteren, goed aansluit bij jullie werkwijze.

Ik ben een snelle leerling, werk graag samen en breng energie mee. Ik zou graag meer vertellen over hoe ik een bijdrage kan leveren aan [bedrijf].

Graag kom ik langs om mijn motivatie en ervaring verder toe te lichten.

Met vriendelijke groet,

${name}
${contact}`;
}

export const DEFAULT_EMAIL_TEMPLATE = getDefaultEmailTemplate();
export const DEFAULT_LETTER_TEMPLATE = getDefaultLetterTemplate();
