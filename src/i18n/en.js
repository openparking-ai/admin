// English. Every word a person can read on these screens is here or in es.js.
//
// `{name}` is filled in where the words are used. A `.words` entry is never
// shown: it is the other things a person might type into Quick Find, separated
// by commas.

export default {
  'app.name': 'Open Parking AI',
  'app.wordmark': 'OpenParking',
  'app.wordmarkEnd': '.ai',
  'app.tagline': 'For the owner',

  'nav.label': 'Pages',

  'page.home.title': 'Home',
  'page.home.purpose':
    'See at a glance whether each lane is working, and how many cars are inside right now.',
  'page.home.words': 'home, start, overview, summary, main, today',

  'page.garages.title': 'Garages',
  'page.garages.purpose':
    'Each of your garages: its name, its time zone, its currency, whether it takes transient parkers, and when it goes live.',
  'page.garages.words': 'garage, garages, parking, lot, location, time zone, currency, go live, open',

  'page.lanes.title': 'Lanes and devices',
  'page.lanes.purpose': 'Your entry and exit lanes, and the equipment at each one.',
  'page.lanes.words': 'lane, lanes, entry, exit, gate, barrier, device, devices, equipment, camera',

  'page.readers.title': 'Card readers',
  'page.readers.purpose': 'The card readers in your garages, and which lane each one is on.',
  'page.readers.words': 'card reader, reader, readers, card, credit card, tap, pay at the lane',

  'page.rates.title': 'Rates',
  'page.rates.purpose': 'What you charge: your monthly rate, transient rate and registered transient rate.',
  'page.rates.words':
    'rate, rates, price, prices, pricing, how much, monthly rate, transient rate, registered transient rate',

  'page.taxes.title': 'Taxes and fees',
  'page.taxes.purpose': 'The taxes and fees your garage adds to what a driver pays.',
  'page.taxes.words': 'tax, taxes, fee, fees, sales tax, surcharge',

  'page.paid.title': 'Getting paid',
  'page.paid.purpose': "Your garage's Stripe account, where the money from card payments is paid out to you.",
  'page.paid.words': 'getting paid, paid, payout, payouts, money, bank, deposit, stripe, account',

  'page.inside.title': 'Cars inside',
  'page.inside.purpose': 'The cars parked in your garage right now.',
  'page.inside.words': 'cars inside, cars, car, inside, parked, how full, who is parked, now',

  'theme.label': 'Look',
  'theme.day': 'Day',
  'theme.night': 'Night',
  'theme.auto': 'Auto',
  'theme.autoHint': 'Same as your computer',

  'language.label': 'Language',
  'language.en': 'English',
  'language.es': 'Español',

  'quickFind.pill': 'Quick Find',
  'quickFind.label': 'Quick Find',
  'quickFind.placeholder': 'Find a page or a setting',
  'quickFind.shortcutMac': '⌘ K',
  'quickFind.shortcutOther': 'Ctrl K',
  'quickFind.groupPages': 'Pages',
  'quickFind.groupSettings': 'Settings',
  'quickFind.nothing': 'Nothing matches “{typed}”.',
  'quickFind.hint': '↑ ↓ to move · Enter to open · Esc to close',

  'feature.day.title': 'Day look',
  'feature.day.words': 'day, light, bright, white, look',
  'feature.night.title': 'Night look',
  'feature.night.words': 'night, dark, black, look',
  'feature.auto.title': 'Look the same as my computer',
  'feature.auto.words': 'auto, automatic, computer, same, look',
  'feature.en.title': 'Show in English',
  'feature.en.words': 'english, language',
  'feature.es.title': 'Show in Spanish',
  'feature.es.words': 'spanish, español, language',

  'signIn.title': 'Sign in',
  'signIn.intro': 'Sign in with the email and password for your garages.',
  'signIn.email': 'Email',
  'signIn.password': 'Password',
  'signIn.submit': 'Sign in',
  'signIn.working': 'Signing in…',
  'signOut': 'Sign out',

  'problem.refused':
    'That email and password did not work. After several wrong tries, signing in from here is paused for 30 minutes.',
  'problem.tooMany': 'There have been too many tries to sign in from here. Please wait a while, then try again.',
  'problem.busy': 'Signing in is busy right now. Please try again in a moment.',
  'problem.notSetUp':
    'Signing in is not set up on your garage system yet. Ask whoever installed it to finish setting it up.',
  'problem.wrongPlace':
    'This page was not opened from the usual address of your garage system. Open it from that address and try again.',
  'problem.incomplete': 'Check that the email and the password are both filled in, then try again.',
  'problem.ended': 'You were signed out. Please sign in again.',
  'problem.unreachable': 'Your garage system cannot be reached right now. Check the internet connection and try again.',
  'problem.unexpected': 'Something went wrong on our side. Please try again in a moment.',

  'loading': 'Loading…',
  'retry': 'Try again',
  'yes': 'Yes',
  'no': 'No',

  'garage.choose': 'Choose a garage',
  'garage.change': 'Change garage',
  'garage.none': 'There are no garages on this account yet.',
  'garage.live': 'Open',
  'garage.notLive': 'Not open yet',

  'home.lanes': 'Lanes',
  'home.inside': 'Cars inside',

  'lane.in': 'In',
  'lane.out': 'Out',
  'lane.workingNow': 'Working, heard from just now',
  'lane.workingOne': 'Working, heard from a minute ago',
  'lane.workingMany': 'Working, heard from {minutes} minutes ago',
  'lane.quiet': 'Not heard from since {time}',
  'lane.never': 'Never heard from',
  'lane.noComputer': 'No lane computer yet',
  'device.off': 'Disconnected {time}',

  'lanes.none': 'This garage has no lanes yet.',
  'lanes.lane': 'Lane',
  'lanes.direction': 'In or out',
  'lanes.computers': 'Lane computers',
  'lanes.reader': 'Card reader',
  'lanes.readerYes': 'Yes',
  'lanes.readerNo': 'None',

  'inside.countNone': 'No cars inside',
  'inside.countOne': '1 car inside',
  'inside.countMany': '{count} cars inside',
  'inside.unconfirmedOne': '1 more was let in, but the lane could not confirm it drove in.',
  'inside.unconfirmedMany': '{count} more were let in, but the lane could not confirm they drove in.',
  'inside.empty': 'No cars are inside right now.',
  'inside.plate': 'Plate',
  'inside.ticket': 'Ticket',
  'inside.cameIn': 'Came in',
  'inside.lane': 'Lane',
  'inside.confirmed': 'Confirmed inside',

  'print.button': 'Print',
  'print.printed': 'Printed {time}',
};
