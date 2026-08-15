"""
Generate topic-specific security-awareness training videos for CyberSafe Nepal.

Research basis: security-awareness microlearning works best at ~2-5 minutes
(systematic reviews cite 1-3, 5-7 and 5-8 minute modules as equally effective;
industry phishing modules are standardised around 5 minutes). Each lesson video
here targets ~3 minutes — long enough for a meaningful lesson, short enough to
finish at the moment of need, right after the employee clicks a phish.

Each video is a dark-theme slide deck (matching the dashboard) with a gTTS
voiceover in English and Nepali. Rendered with Pillow (slides) + ffmpeg (encode
from imageio-ffmpeg's static binary, since imageio builds lack drawtext).

Usage:
    python scripts/generate_training_videos.py [--only phishing-basics]
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from imageio_ffmpeg import get_ffmpeg_exe  # noqa: E402

FFMPEG = get_ffmpeg_exe()
FONT_DIR = Path("/usr/share/fonts/truetype/freefont")
FONT_BOLD = FONT_DIR / "FreeSansBold.ttf"
FONT_REG = FONT_DIR / "FreeSans.ttf"

W, H = 1280, 720
FPS = 25
OUT_DIR = Path(__file__).resolve().parent.parent / "media" / "training"
WORK = Path("/tmp/opencode/lesson_build")

BG_TOP = (15, 23, 42)      # slate-900
BG_BOTTOM = (11, 18, 32)   # slate-950
TEXT = (226, 232, 240)
MUTED = (148, 163, 184)
PANEL = (30, 41, 59, 150)

ACCENTS = {
    "phishing-basics": (239, 68, 68),       # red
    "credential-phishing": (249, 115, 22),  # orange
    "malware-link": (139, 92, 246),         # violet
    "urgency-bait": (245, 158, 11),         # amber
}

BRAND = "CYBERSafe Nepal — SECURITY AWARENESS"

# A slide: (type, kicker, title, lines[], narration)
# type: title | content | summary
# In `lines`, *word* is rendered in the accent color. `narr` is spoken.
SLIDES = {
    "phishing-basics": [
        ("title",
         "Lesson 01",
         "Phishing Basics: Spot the Hook",
         ["The four universal red flags of phishing emails"],
         "Welcome to your CyberSafe Nepal security lesson. Today you will learn to spot the perfect phishing email before you fall for it."),
        ("content",
         "What is phishing?",
         "A trap, delivered like a normal message",
         ["A fake email or message that imitates a *real company* or *colleague*",
          "Its one job: make you *click*, *enter data*, or *open a file*",
          "Anyone can be targeted — attackers exploit *trust*, not weakness"],
         "Phishing is a fake message that dresses up as a real company or a trusted colleague. Its only job is to get you to click a link, type in your password, or open a file. Attackers target ordinary people, not because they are careless, but because they are humans who trust their inbox."),
        ("content",
         "Why it works",
         "It short-circuits your thinking",
         ["Urgency, fear and curiosity are *weapons*, not style choices",
          "Pressure asks you to act *before you verify*",
          "A calm 60-second check destroys most phishes"],
         "Why does it work? Because the email creates pressure: urgency, fear, or curiosity. These are weapons, not style choices. The faster you act, the less likely you are to check. A calm sixty second check destroys most phishing attempts."),
        ("content",
         "The four red flags",
         "Check these on every email",
         ["*Sender*: the exact address, not the display name",
          "*Urgency*: a fake deadline is a warning sign",
          "*Links*: hover and read the real domain before clicking",
          "*Requests*: real companies never ask for your password"],
         "Look for four red flags. One: the sender. Check the exact email address, not just the display name. Two: urgency. A rushed deadline is a warning sign. Three: links. Hover over them and read the real domain before you click. Four: requests. Legitimate companies never ask for your password by email."),
        ("content",
         "Safe habits",
         "Two habits block almost every phish",
         ["*Pause* 60 seconds before acting on any unexpected message",
          "*Verify* through a channel you trust: the real website, or a phone call"],
         "Build two habits. First, pause for sixty seconds before acting on any unexpected message. Second, verify through a channel you trust: the real website, or a phone call to the person who supposedly wrote to you."),
        ("content",
         "Already clicked?",
         "It happens — what matters is the next step",
         ["*Do not* type anything new into the page",
          "Change that password once, from the real site",
          "*Report* it to security — reporting is always rewarded"],
         "If you already clicked a suspicious link, that happens to the best of us. What matters is the next step. Do not type anything new into the page. Change that password once from the real website, and report the email to your security team. Reporting is always rewarded, never punished."),
        ("summary",
         "Lesson 01 — complete",
         "Spot it. Pause. Verify. Report.",
         ["Sender, urgency, links, requests — *check all four*",
          "Pause 60 seconds — *then* decide",
          "Clicking is human; *reporting is you being your best*"],
         "Remember the four red flags: sender, urgency, links, and requests. Pause before you act, verify through a trusted channel, and report anything suspicious. You are now ready for the quiz."),
    ],
    "credential-phishing": [
        ("title",
         "Lesson 02",
         "Credential Phishing: Protect Your Password",
         ["Fake login pages, lookalike domains, and the habits that protect you"],
         "Welcome to lesson two: credential phishing. This is the most common attack on the internet, and it is aimed directly at your password."),
        ("content",
         "The attack",
         "A perfect copy of a login page",
         ["Attackers build pages that *look exactly* like your portal",
          "The link in the email takes you to a *lookalike domain*",
          "The password you type goes straight to *the attacker*"],
         "Here is how it works. Attackers build a page that looks exactly like your company portal or your bank. The link in the email takes you to a lookalike domain, not the real site. The moment you type your password, it goes straight to the attacker."),
        ("content",
         "The address bar",
         "Your first and best line of defense",
         ["A login page is safe only if you reached it by *typing the address* yourself",
          "Read the domain *letter by letter*: acme.com vs acme-verify.net",
          "Logos, locks and design can all be *copied* — the domain cannot"],
         "Your first line of defense is the address bar. A login page is only safe if you reached it by typing the address yourself. Read the domain letter by letter. Acme dot com is not acme dash verify dot net. Logos, lock icons, and professional design can all be copied. The exact domain is the one thing that is hard to fake."),
        ("content",
         "Password habits",
         "One password should break only one account",
         ["*Never reuse* passwords across sites — breaches happen constantly",
          "A password manager makes unique passwords *easy*",
          "*Multi-factor authentication*: a stolen password alone is not enough"],
         "Protect your password habits. Never reuse passwords across sites, because data breaches happen constantly, and a password stolen from one service must never open your bank or your email. Use a password manager so every account gets its own strong password. And enable multi-factor authentication, so that even a stolen password is not enough."),
        ("content",
         "Spot the trap",
         "Realistic examples you will see",
         ["'Your password *expires in 24 hours*' — reset it from the real portal",
          "'We need you to *confirm your identity*' — via a link? No.",
          "The request is *unexpected* and the link is *unfamiliar* — stop"],
         "You will see this in your inbox. Your password expires in twenty four hours. We need you to confirm your identity. If the request is unexpected, and the link takes you somewhere unfamiliar, stop. Reset your password only from the real portal, which you open yourself."),
        ("content",
         "Typed it already?",
         "Act now, in three steps",
         ["*Change that password* — once, from the real site",
          "Enable *MFA* if it was off",
          "*Report* the page to your security team"],
         "If you already typed your password, act now. Change that password once from the real website. Turn on multi factor authentication if it was off. And report the fake page to your security team so they can block it for everyone."),
        ("summary",
         "Lesson 02 — complete",
         "Your password is the key. Guard it.",
         ["Type the address yourself — *always*",
          "Check the domain *letter by letter*",
          "Unique passwords + *MFA* = double defense"],
         "Your password is the key to your work and your money. Reach login pages by typing the address yourself, check the domain letter by letter, and use unique passwords with multi factor authentication. Now, let us test what you learned."),
    ],
    "malware-link": [
        ("title",
         "Lesson 03",
         "Malicious Links & Attachments",
         ["A single click on a document or meeting link can spread harm"],
         "Welcome to lesson three. One click on a document link or a meeting invite can install harmful software. Let us learn to stop it."),
        ("content",
         "The disguise",
         "It looks like normal work",
         ["Shared documents, calendar invites — the *favourite disguises*",
          "A message that pushes you to a link *outside your normal tool*",
          "'The calendar glitched, use this link' — *always* suspicious"],
         "Harmful links hide in everyday work. Shared documents and calendar invites are the favourite disguises. The tell is when a message pushes you to a link outside your normal tool. If the calendar glitched, and you must use some other link to join, that is always suspicious."),
        ("content",
         "Hover first",
         "The link's real destination shows before you click",
         ["Hover over the link — the *true address* appears",
          "Is it the domain you expected, or a *lookalike*?",
          "When in doubt, *type the address yourself* or ask the sender"],
         "Here is the habit that saves you. Hover over any link before you click it, and the true address appears. Ask yourself: is this the domain I expect, or a lookalike? If you are in doubt, type the address yourself, or call the sender and ask."),
        ("content",
         "Attachments",
         "Documents can carry malware inside",
         ["Never *enable macros or scripts* from an email attachment",
          "Preview documents in the *isolated viewer* instead",
          "Unexpected downloads should be *quarantined*, never opened"],
         "Attachments can carry malware inside. Never enable macros or scripts from an email attachment, because that is how malware installs. Preview suspicious documents in the safe, isolated viewer instead. And remember: unexpected downloads should be quarantined, never opened."),
        ("content",
         "The calm check",
         "30 seconds before you click",
         ["Does this message *match the sender's normal behaviour*?",
          "Is the *requested action* something they would ask by email?",
          "If no fits — *verify privately*: call, or real tool"],
         "Take thirty seconds before you click. Does this message match how the sender normally behaves? Is the requested action something they would ask for by email? If the pieces do not fit, verify privately. Call the person, or use your real calendar tool."),
        ("content",
         "Clicked already?",
         "Contain the damage",
         ["*Disconnect* from the network if something looks wrong",
          "Do not open the downloaded file",
          "*Report* it immediately with the sender's address and link"],
         "If you clicked a link that downloaded something unexpected, contain the damage. Do not open the file. If your machine starts acting strangely, disconnect from the network. Then report it immediately, including the sender address and the link, so security can act."),
        ("summary",
         "Lesson 03 — complete",
         "Hover. Verify. Contain. Report.",
         ["Hover every link — *read the real domain*",
          "No macros from email, *ever*",
          "Unexpected file? *Quarantine and report*"],
         "Remember the cycle: hover every link and read the real domain. Never enable macros from email. If a file appears out of nowhere, quarantine it and report. You are ready for the quiz."),
    ],
    "urgency-bait": [
        ("title",
         "Lesson 04",
         "Urgency & Bait Tactics",
         ["Deadlines, refunds and final notices are weapons — not warnings"],
         "Welcome to lesson four. Deadlines, refunds and final notices. They look like warnings, but they are weapons. Here is how to disarm them."),
        ("content",
         "The bait",
         "Pressure is the message",
         ["'Your parcel returns in *48 hours*' — real couriers email politely",
          "'*Final notice*: account closes today' — services tell you in advance",
          "Every urgent story has one goal: *act before you verify*"],
         "Here is the bait. Your parcel returns in forty eight hours. Final notice, your account closes today. Real couriers and real services never threaten you through a single email. Every urgent story has one goal: get you to act before you verify."),
        ("content",
         "Ground truth",
         "Check the story, not the scare",
         ["Do you have a *parcel, account, or policy* with this sender at all?",
          "Check through the *official app or website*, never the link",
          "An email claiming a refund you never asked for is *not real*"],
         "Before you react, check the story. Do you actually have a parcel, an account, or a policy with this sender? Check through the official app or the real website, never through the link. And an email announcing a refund you never claimed is simply not real."),
        ("content",
         "The 60-second pause",
         "Your best habit against every bait",
         ["*Breathe*: no legitimate action is actually that urgent",
          "*Re-read* the email slowly — the inconsistencies surface",
          "Then decide: verify, ignore, or *report*"],
         "Build the sixty second pause. Breathe, because no legitimate action is actually that urgent. Re-read the email slowly, and the inconsistencies surface. Then decide calmly: verify it, ignore it, or report it."),
        ("content",
         "Realistic examples",
         "Spot them in your inbox",
         ["'Your *tax refund* is waiting' — contact the department through its *official* number",
          "'Pay a *rescheduling fee* via link to save your parcel' — you are the target, not the customer",
          "'*Exclusive prize*, claim in 6 hours' — nobody you know wins like this"],
         "Let us spot them. A tax refund is waiting: contact the department through its official number from its real website. A rescheduling fee to save your parcel: you are the target, not the customer. An exclusive prize you must claim in six hours: nobody you know wins like this."),
        ("content",
         "Pushed too far?",
         "The pressure worked — now what",
         ["*Stop* typing any more information",
          "Reset credentials if you shared any",
          "*Report* the message — you are the first line of defense for everyone"],
         "If the pressure got you, stop. Do not type any more information. If you shared any credentials, reset them right away. Then report the message to security. You are the first line of defense for your whole team."),
        ("summary",
         "Lesson 04 — complete",
         "Urgent stories deserve slow answers.",
         ["*Pause 60 seconds* before any urgent action",
          "*Check the story* against the official channel",
          "When it smells like bait — *report it*"],
         "Urgent stories deserve slow answers. Pause for sixty seconds, check the story against the official channel, and when it smells like bait, report it. Let us see what you remember."),
    ],
}


# Nepali version of each slide: (kicker, title, lines[], narration)
SLIDES_NE = {
    "phishing-basics": [
        ("पाठ ०१",
         "फिशिङका आधारभूत कुरा: हुक चिन्नुहोस्",
         ["फिशिङ इमेलका चार सामान्य संकेतहरू"],
         "तपाईंलाई साइबरसेफ नेपालको सुरक्षा पाठमा स्वागत छ। आज तपाईंले फिशिङ इमेललाई झुक्किनुअघि नै चिन्न सिक्नुहुनेछ।"),
        ("फिशिङ के हो?",
         "एउटा जाल, सामान्य सन्देश जस्तो देखिने",
         ["*वास्तविक कम्पनी* वा *सहकर्मी* जस्तो देखिने नक्कली इमेल",
          "यसको एक मात्र काम: तपाईंलाई *क्लिक*, *डाटा प्रविष्टि* वा *फाइल खोल्न* बाध्य पार्नु",
          "जोखिम सबैमा हुन्छ — आक्रमणकारी *विश्वास*को शोषण गर्छन्"],
         "फिशिङ भनेको नक्कली सन्देश हो जसले वास्तविक कम्पनी वा विश्वसनीय सहकर्मीको भेष धारण गर्छ। यसको एक मात्र काम तपाईंलाई लिङ्क क्लिक गराउनु, पासवर्ड टाइप गराउनु वा फाइल खोल्नु हो। आक्रमणकारीले सामान्य मानिसलाई निशाना बनाउँछन्, किनकि तिनीहरू इनबक्समा विश्वास गर्छन्।"),
        ("यो किन सफल हुन्छ?",
         "यसले तपाईंको सोचाइलाई छोटो बनाउँछ",
         ["हतार, डर र जिज्ञासा *हतियार* हुन्, शैली होइन",
          "दबाबले *जाँच्नुअघि नै* कार्य गराउँछ",
          "शान्त ६०-सेकेन्डको जाँचले धेरैजसो फिश नष्ट गर्छ"],
         "यो किन सफल हुन्छ? किनकि इमेलले दबाब सिर्जना गर्छ: हतार, डर वा जिज्ञासा। यी हतियार हुन्, शैली होइन। जति छिटो कार्य गर्नुहुन्छ, जाँच्ने सम्भावना त्यति कम हुन्छ। शान्त ६० सेकेन्डको जाँचले धेरैजसो फिशिङ प्रयास असफल बनाउँछ।"),
        ("चार प्रमुख संकेत",
         "हरेक इमेलमा यी जाँच्नुहोस्",
         ["*पठाउने*: प्रदर्शन नाम होइन, सही ठेगाना",
          "*हतारो*: नक्कली म्याद एउटा चेतावनी हो",
          "*लिङ्क*: क्लिकअघि hover गरी वास्तविक डोमेन हेर्नुहोस्",
          "*अनुरोध*: वास्तविक कम्पनीले पासवर्ड कहिल्यै माग्दैन"],
         "चार प्रमुख संकेत हेर्नुहोस्। पहिलो, पठाउने। प्रदर्शन नाम होइन, सही इमेल ठेगाना जाँच्नुहोस्। दोस्रो, हतारो। नक्कली म्याद चेतावनी हो। तेस्रो, लिङ्क। क्लिकअघि hover गरी वास्तविक डोमेन पढ्नुहोस्। चौथो, अनुरोध। वैध कम्पनीले इमेलबाट पासवर्ड कहिल्यै माग्दैन।"),
        ("सुरक्षित बानीहरू",
         "दुई बानीले लगभग सबै फिश रोक्छ",
         ["कुनै पनि अप्रत्याशित सन्देशमा कार्यअघि ६० सेकेन्ड *रोकिनुहोस्*",
          "*विश्वसनीय माध्यम*बाट प्रमाणित गर्नुहोस्: वास्तविक वेबसाइट वा फोन"],
         "दुई बानी बनाउनुहोस्। पहिलो, कुनै पनि अप्रत्याशित सन्देशमा कार्य गर्नुअघि ६० सेकेन्ड रोकिनुहोस्। दोस्रो, विश्वसनीय माध्यमबाट प्रमाणित गर्नुहोस्: वास्तविक वेबसाइट, वा लेख्ने व्यक्तिलाई फोन गरेर सोध्नुहोस्।"),
        ("क्लिक गरिसक्नुभयो?",
         "यो हुन्छ — महत्वपूर्ण कुरा अर्को कदम हो",
         ["पेजमा केही पनि नयाँ *नटाइप गर्नुहोस्*",
          "वास्तविक साइटबाट एकपटक पासवर्ड *परिवर्तन गर्नुहोस्*",
          "सुरक्षा टोलीलाई *रिपोर्ट गर्नुहोस्* — रिपोर्टिङ सधैं पुरस्कृत हुन्छ"],
         "यदि क्लिक गरिसक्नुभयो भने, सबैभन्दा राम्रा व्यक्तिहरूसँग पनि यो हुन्छ। महत्वपूर्ण कुरा अर्को कदम हो। पेजमा केही पनि नयाँ नटाइप गर्नुहोस्। वास्तविक वेबसाइटबाट एकपटक पासवर्ड परिवर्तन गर्नुहोस्, र इमेल सुरक्षा टोलीलाई रिपोर्ट गर्नुहोस्। रिपोर्टिङ सधैं पुरस्कृत हुन्छ, कहिल्यै दण्ड होइन।"),
        ("पाठ ०१ — पूरा",
         "चिन्नुहोस्। रोकिनुहोस्। प्रमाणित गर्नुहोस्। रिपोर्ट गर्नुहोस्।",
         ["पठाउने, हतारो, लिङ्क, अनुरोध — *चारै जाँच्नुहोस्*",
          "६० सेकेन्ड रोकिनुहोस् — अनि मात्र *निर्णय गर्नुहोस्*",
          "क्लिक गर्नु मानवीय हो; *रिपोर्ट गर्नु तपाईंको उत्कृष्टता हो*"],
         "चार प्रमुख संकेत सम्झनुहोस्: पठाउने, हतारो, लिङ्क र अनुरोध। कार्यअघि रोकिनुहोस्, विश्वसनीय माध्यमबाट प्रमाणित गर्नुहोस्, र शंकास्पद कुरा रिपोर्ट गर्नुहोस्। अब तपाईं क्विजका लागि तयार हुनुहुन्छ।"),
    ],
    "credential-phishing": [
        ("पाठ ०२",
         "क्रेडेन्सियल फिशिङ: आफ्नो पासवर्ड जोगाउनुहोस्",
         ["नक्कली लगइन पेज, समान देखिने डोमेन, र सुरक्षा बानीहरू"],
         "पाठ दुईमा स्वागत छ: क्रेडेन्सियल फिशिङ। यो इन्टरनेटको सबैभन्दा सामान्य आक्रमण हो, र यसको निशाना सीधै तपाईंको पासवर्ड हो।"),
        ("आक्रमण",
         "लगइन पेजको उत्तम नक्कल",
         ["आक्रमणकारीले तपाईंको पोर्टलजस्तै *ठ्याक्कै देखिने* पेज बनाउँछन्",
          "इमेलको लिङ्कले *समान देखिने डोमेन*मा लैजान्छ",
          "तपाईंले टाइप गरेको पासवर्ड सीधै *आक्रमणकारीकहाँ* पुग्छ"],
         "यो कसरी हुन्छ भन्ने हेरौं। आक्रमणकारीहरूले तपाईंको कम्पनीको पोर्टल वा बैंकजस्तै देखिने पेज बनाउँछन्। इमेलको लिङ्कले वास्तविक साइट होइन, समान देखिने डोमेनमा पुर्‍याउँछ। पासवर्ड टाइप गर्नेबित्तिकै त्यो सीधै आक्रमणकारीकहाँ जान्छ।"),
        ("ठेगाना पट्टी",
         "तपाईंको पहिलो र उत्तम सुरक्षा रेखा",
         ["लगइन पेज सुरक्षित हुन्छ जब ठेगाना *आफैं टाइप गर्नुहुन्छ*",
          "डोमेन *अक्षरैपिच्छे* पढ्नुहोस्: acme.com बनाम acme-verify.net",
          "लोगो, लक र डिजाइन *नक्कल* गर्न सकिन्छ — डोमेन सकिँदैन"],
         "तपाईंको पहिलो सुरक्षा रेखा ठेगाना पट्टी हो। लगइन पेज तब मात्र सुरक्षित हुन्छ जब तपाईं आफैंले ठेगाना टाइप गरेर पुग्नुहुन्छ। डोमेन अक्षरैपिच्छे पढ्नुहोस्। एसीएमई डट कम, एसीएमई ड्यास भेरिफाई डट नेट होइन। लोगो, लक आइकन र व्यावसायिक डिजाइन सबै नक्कल गर्न सकिन्छ। तर सही डोमेन नक्कल गर्न गाह्रो छ।"),
        ("पासवर्ड बानी",
         "एउटा पासवर्डले एउटा मात्र खाता तोड्न सकोस्",
         ["पासवर्ड *कहिल्यै दोहोर्‍याउनु हुँदैन* — ब्रेच निरन्तर हुन्छन्",
          "पासवर्ड म्यानेजरले अद्वितीय पासवर्ड *सजिलो* बनाउँछ",
          "*मल्टिफ्याक्टर प्रमाणीकरण*: चोरीको पासवर्डले मात्र पर्याप्त हुँदैन"],
         "पासवर्ड बानी जोगाउनुहोस्। पासवर्ड कहिल्यै दोहोर्‍याउनु हुँदैन, किनकि डाटा ब्रेच निरन्तर हुन्छन्, र एउटा सेवाबाट चोरी भएको पासवर्डले कहिल्यै तपाईंको बैंक वा इमेल खोल्नु हुँदैन। पासवर्ड म्यानेजर प्रयोग गर्नुहोस् ताकि हरेक खाताको आफ्नै बलियो पासवर्ड होस्। र मल्टिफ्याक्टर प्रमाणीकरण सक्रिय गर्नुहोस्, ताकि चोरीको पासवर्डले मात्र केही नहोस्।"),
        ("जाल चिन्नुहोस्",
         "तपाईंले देख्ने यथार्थ उदाहरणहरू",
         ["'तपाईंको पासवर्ड *२४ घण्टामा समाप्त हुन्छ*' — वास्तविक पोर्टलबाट परिवर्तन गर्नुहोस्",
          "'हामीलाई तपाईंको *पहिचान पुष्टि* चाहियो' — लिङ्कबाट? होइन।",
          "अनुरोध *अप्रत्याशित* र लिङ्क *अपरिचित* छ — रोकिनुहोस्"],
         "तपाईंले यो आफ्नो इनबक्समा देख्नुहुनेछ। तपाईंको पासवर्ड २४ घण्टामा समाप्त हुन्छ। हामीलाई तपाईंको पहिचान पुष्टि चाहियो। यदि अनुरोध अप्रत्याशित छ र लिङ्क अपरिचित ठाउँमा लैजान्छ भने, रोकिनुहोस्। आफैं खोलेको वास्तविक पोर्टलबाट मात्र पासवर्ड परिवर्तन गर्नुहोस्।"),
        ("टाइप गरिसक्नुभयो?",
         "अहिले नै तीन कदम चाल्नुहोस्",
         ["वास्तविक साइटबाट एकपटक पासवर्ड *परिवर्तन गर्नुहोस्*",
          "नचलेको भए *MFA* सक्रिय गर्नुहोस्",
          "पेज सुरक्षा टोलीलाई *रिपोर्ट गर्नुहोस्*"],
         "यदि पासवर्ड टाइप गरिसक्नुभयो भने, अहिले नै कार्य गर्नुहोस्। वास्तविक वेबसाइटबाट एकपटक पासवर्ड परिवर्तन गर्नुहोस्। मल्टिफ्याक्टर प्रमाणीकरण बन्द भएको भए सक्रिय गर्नुहोस्। र नक्कली पेज सुरक्षा टोलीलाई रिपोर्ट गर्नुहोस्, ताकि उनीहरूले सबैका लागि रोक्न सकून्।"),
        ("पाठ ०२ — पूरा",
         "तपाईंको पासवर्ड साँचो हो। यसलाई जोगाउनुहोस्।",
         ["ठेगाना आफैं टाइप गर्नुहोस् — *सधैं*",
          "डोमेन *अक्षरैपिच्छे* जाँच्नुहोस्",
          "अद्वितीय पासवर्ड + *MFA* = दोहोरो सुरक्षा"],
         "तपाईंको पासवर्ड तपाईंको काम र पैसाको साँचो हो। लगइन पेजमा आफैं ठेगाना टाइप गरेर पुग्नुहोस्, डोमेन अक्षरैपिच्छे जाँच्नुहोस्, र मल्टिफ्याक्टर प्रमाणीकरणसहित अद्वितीय पासवर्ड प्रयोग गर्नुहोस्। अब, तपाईंले सिकेको कुरा परीक्षण गरौं।"),
    ],
    "malware-link": [
        ("पाठ ०३",
         "दुर्भावनापूर्ण लिङ्क र एट्याचमेन्ट",
         ["डकुमेन्ट वा मिटिङ लिङ्कमा एउटा क्लिकले हानि फैलाउन सक्छ"],
         "पाठ तीनमा स्वागत छ। डकुमेन्ट लिङ्क वा मिटिङ निमन्त्रणामा एउटा क्लिकले हानिकारक सफ्टवेयर स्थापना गर्न सक्छ। यसलाई रोक्न सिकौं।"),
        ("भेष",
         "यो सामान्य कामजस्तो देखिन्छ",
         ["साझा डकुमेन्ट, क्यालेन्डर निमन्त्रणा — *मनपर्ने भेष*",
          "तपाईंलाई *आफ्नो सामान्य टुलभन्दा बाहिरको* लिङ्कमा धकेल्ने सन्देश",
          "'क्यालेन्डर गडबड भयो, यो लिङ्क प्रयोग गर्नुहोस्' — *सधैं शंकास्पद*"],
         "दुर्भावनापूर्ण लिङ्क दैनिक काममा लुक्छन्। साझा डकुमेन्ट र क्यालेन्डर निमन्त्रणा मनपर्ने भेष हुन्। संकेत भनेको सन्देशले तपाईंलाई आफ्नो सामान्य टुलभन्दा बाहिरको लिङ्कमा लैजानु हो। यदि क्यालेन्डर गडबड भयो भनेर अर्को लिङ्क प्रयोग गर्न भनियो भने, त्यो सधैं शंकास्पद हो।"),
        ("पहिले Hover गर्नुहोस्",
         "क्लिक गर्नुअघि नै लिङ्कको वास्तविक गन्तव्य देखिन्छ",
         ["लिङ्कमा hover गर्दा *वास्तविक ठेगाना* देखिन्छ",
          "अपेक्षित डोमेन हो वा *समान देखिने*?",
          "शंका लागे *आफैं ठेगाना टाइप गर्नुहोस्* वा पठाउनेलाई सोध्नुहोस्"],
         "तपाईंलाई बचाउने बानी यहाँ छ। कुनै पनि लिङ्कमा क्लिकअघि hover गर्नुहोस्, र वास्तविक ठेगाना देखिन्छ। आफैंलाई सोध्नुहोस्: यो अपेक्षित डोमेन हो कि समान देखिने? शंका लागे, आफैं ठेगाना टाइप गर्नुहोस्, वा पठाउनेलाई फोन गरेर सोध्नुहोस्।"),
        ("एट्याचमेन्ट",
         "डकुमेन्टभित्र मालवेयर लुक्न सक्छ",
         ["इमेल एट्याचमेन्टबाट *म्याक्रो वा स्क्रिप्ट कहिल्यै सक्षम नगर्नुहोस्*",
          "शंकास्पद डकुमेन्ट *पृथक भ्युअर*मा मात्र हेर्नुहोस्",
          "अप्रत्याशित डाउनलोड *क्वारेन्टाइन* गर्नुहोस्, कहिल्यै नखोल्नुहोस्"],
         "एट्याचमेन्टभित्र मालवेयर लुक्न सक्छ। इमेल एट्याचमेन्टबाट म्याक्रो वा स्क्रिप्ट कहिल्यै सक्षम नगर्नुहोस्, किनकि मालवेयर त्यसरी नै स्थापना हुन्छ। शंकास्पद डकुमेन्ट सुरक्षित, पृथक भ्युअरमा मात्र हेर्नुहोस्। र सम्झनुहोस्: अप्रत्याशित डाउनलोड कहिल्यै नखोल्नुहोस्, क्वारेन्टाइन गरी रिपोर्ट गर्नुहोस्।"),
        ("शान्त जाँच",
         "क्लिकअघि ३० सेकेन्ड",
         ["के यो सन्देश पठाउनेको *सामान्य व्यवहारसँग मेल खान्छ*?",
          "के *मागिएको कार्य* इमेलबाट गर्ने कुरा हो?",
          "मेल नखाए — *निजी रूपमा प्रमाणित गर्नुहोस्*: फोन वा वास्तविक टुल"],
         "क्लिक गर्नुअघि ३० सेकेन्ड लिनुहोस्। के यो सन्देश पठाउनेको सामान्य व्यवहारसँग मेल खान्छ? के मागिएको कार्य उनीहरूले इमेलबाट गर्ने कुरा हो? कुरा मेल नखाए, निजी रूपमा प्रमाणित गर्नुहोस्। व्यक्तिलाई फोन गर्नुहोस्, वा आफ्नो वास्तविक क्यालेन्डर टुल प्रयोग गर्नुहोस्।"),
        ("क्लिक गरिसक्नुभयो?",
         "क्षति सीमित गर्नुहोस्",
         ["केही गडबड देखिए *नेटवर्कबाट विच्छेद गर्नुहोस्*",
          "डाउनलोड भएको फाइल नखोल्नुहोस्",
          "पठाउने ठेगाना र लिङ्कसहित *तुरुन्त रिपोर्ट गर्नुहोस्*"],
         "यदि क्लिक गर्दा अप्रत्याशित फाइल डाउनलोड भयो भने, क्षति सीमित गर्नुहोस्। फाइल नखोल्नुहोस्। कम्प्युटर अनौठो व्यवहार गर्न थाले, नेटवर्कबाट विच्छेद गर्नुहोस्। अनि पठाउने ठेगाना र लिङ्कसहित तुरुन्त रिपोर्ट गर्नुहोस्।"),
        ("पाठ ०३ — पूरा",
         "Hover गर्नुहोस्। प्रमाणित गर्नुहोस्। नियन्त्रण गर्नुहोस्। रिपोर्ट गर्नुहोस्।",
         ["हरेक लिङ्कमा hover — *वास्तविक डोमेन पढ्नुहोस्*",
          "इमेलबाट म्याक्रो, *कहिल्यै होइन*",
          "अप्रत्याशित फाइल? *क्वारेन्टाइन र रिपोर्ट*"],
         "चक्र सम्झनुहोस्: हरेक लिङ्कमा hover गरी वास्तविक डोमेन पढ्नुहोस्। इमेलबाट कहिल्यै म्याक्रो सक्षम नगर्नुहोस्। कतैबाट फाइल देखा पर्यो भने, क्वारेन्टाइन गरी रिपोर्ट गर्नुहोस्। तपाईं क्विजका लागि तयार हुनुहुन्छ।"),
    ],
    "urgency-bait": [
        ("पाठ ०४",
         "हतारो र प्रलोभनको चाल",
         ["म्याद, रिफन्ड र अन्तिम सूचना — चेतावनी होइन, हतियार हुन्"],
         "पाठ चारमा स्वागत छ। म्याद, रिफन्ड र अन्तिम सूचना। यी चेतावनीजस्तो देखिन्छन्, तर यी हतियार हुन्। यिनलाई निस्तेज पार्ने तरिका यहाँ छ।"),
        ("प्रलोभन",
         "दबाब नै सन्देश हो",
         ["'तपाईंको पार्सल *४८ घण्टामा* फिर्ता हुन्छ' — वास्तविक कुरियर विनम्र हुन्छ",
          "'*अन्तिम सूचना*: आज खाता बन्द हुन्छ' — सेवाहरू पहिलेदेखि जानकारी दिन्छन्",
          "हरेक हतारो कथाको एक लक्ष्य: *जाँच्नुअघि नै कार्य गराउनु*"],
         "प्रलोभन यस्तो छ। तपाईंको पार्सल ४८ घण्टामा फिर्ता हुन्छ। अन्तिम सूचना: आज खाता बन्द हुन्छ। वास्तविक कुरियर र वास्तविक सेवाहरूले एउटै इमेलमार्फत धम्की दिँदैनन्। हरेक हतारो कथाको एउटै लक्ष्य हुन्छ: जाँच्नुअघि नै कार्य गराउनु।"),
        ("वास्तविकता जाँच",
         "डर होइन, कथा जाँच्नुहोस्",
         ["के तपाईंसँग यो पठाउनेसँग *पार्सल, खाता वा नीति* छ नै?",
          "*आधिकारिक एप वा वेबसाइट*बाट जाँच्नुहोस्, लिङ्कबाट होइन",
          "नमागेको रिफन्डको इमेल *वास्तविक होइन*"],
         "प्रतिक्रिया दिनुअघि कथा जाँच्नुहोस्। के तपाईंसँग यो पठाउनेसँग पार्सल, खाता वा नीति छ नै? आधिकारिक एप वा वास्तविक वेबसाइटबाट जाँच्नुहोस्, लिङ्कबाट होइन। र नमागेको रिफन्ड घोषणा गर्ने इमेल वास्तविक होइन।"),
        ("६०-सेकेन्ड रोकाइ",
         "हरेक प्रलोभनविरुद्धको उत्तम बानी",
         ["*सास लिनुहोस्*: कुनै पनि वैध कार्य यति हतारो हुँदैन",
          "इमेल *बिस्तारै फेरि पढ्नुहोस्* — विसंगतिहरू देखिन थाल्छन्",
          "अनि निर्णय: प्रमाणित, बेवास्ता, वा *रिपोर्ट*"],
         "६० सेकेन्डको रोकाइको बानी बनाउनुहोस्। सास लिनुहोस्, किनकि कुनै पनि वैध कार्य यति हतारो हुँदैन। इमेल बिस्तारै फेरि पढ्नुहोस्, र विसंगतिहरू देखिन थाल्छन्। अनि शान्त भएर निर्णय गर्नुहोस्: प्रमाणित गर्नुहोस्, बेवास्ता गर्नुहोस्, वा रिपोर्ट गर्नुहोस्।"),
        ("यथार्थ उदाहरणहरू",
         "आफ्नो इनबक्समा चिन्नुहोस्",
         ["'तपाईंको *कर रिफन्ड* पर्खिरहेको छ' — *आधिकारिक* नम्बरबाट सम्पर्क गर्नुहोस्",
          "'पार्सल बचाउन लिङ्कबाट *पुनःनिर्धारण शुल्क तिर्नुहोस्*' — निशाना तपाईं नै हुनुहुन्छ",
          "'*विशेष पुरस्कार*, ६ घण्टामा दाबी गर्नुहोस्' — यस्तो कसैलाई पनि जित्न मिल्दैन"],
         "यी चिन्नुहोस्। कर रिफन्ड पर्खिरहेको छ: आफ्नो वास्तविक वेबसाइटको आधिकारिक नम्बरबाट सम्पर्क गर्नुहोस्। पार्सल बचाउन पुनःनिर्धारण शुल्क: यहाँ निशाना तपाईं नै हुनुहुन्छ, ग्राहक होइन। ६ घण्टामा दाबी गर्ने विशेष पुरस्कार: यस्तो कसैलाई पनि जित्न मिल्दैन।"),
        ("दबाबले जित्यो?",
         "अब के गर्ने",
         ["थप कुनै जानकारी *टाइप गर्न रोक्नुहोस्*",
          "केही साझा गरिसक्नुभए *क्रेडेन्सियल परिवर्तन गर्नुहोस्*",
          "सन्देश *रिपोर्ट गर्नुहोस्* — तपाईं सबैका लागि पहिलो सुरक्षा रेखा हुनुहुन्छ"],
         "यदि दबाबले जित्यो भने, रोकिनुहोस्। थप कुनै जानकारी नटाइप गर्नुहोस्। कुनै क्रेडेन्सियल साझा गरिसक्नुभए भने, तुरुन्त परिवर्तन गर्नुहोस्। अनि सन्देश सुरक्षा टोलीलाई रिपोर्ट गर्नुहोस्। तपाईं आफ्नो सम्पूर्ण टोलीका लागि पहिलो सुरक्षा रेखा हुनुहुन्छ।"),
        ("पाठ ०४ — पूरा",
         "हतारो कथाहरूले ढिलो उत्तर पाउनुपर्छ।",
         ["कुनै पनि हतारो कार्यअघि *६० सेकेन्ड रोकिनुहोस्*",
          "आधिकारिक माध्यमबाट *कथा जाँच्नुहोस्*",
          "प्रलोभनजस्तो लागे — *रिपोर्ट गर्नुहोस्*"],
         "हतारो कथाहरूले ढिलो उत्तर पाउनुपर्छ। कुनै पनि हतारो कार्यअघि ६० सेकेन्ड रोकिनुहोस्, आधिकारिक माध्यमबाट कथा जाँच्नुहोस्, र प्रलोभनजस्तो लागे रिपोर्ट गर्नुहोस्। अब तपाईंले सम्झनुभएको कुरा हेरौं।"),
    ],
}


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REG), size)


def _gradient_bg() -> Image.Image:
    img = Image.new("RGB", (W, H))
    for y in range(H):
        t = y / (H - 1)
        row = tuple(int(BG_TOP[i] * (1 - t) + BG_BOTTOM[i] * t) for i in range(3))
        for x in range(0, W, 64):
            img.paste(row, (x, 0, min(x + 64, W), y + 1))
    return img


def _fit_font(draw, text: str, size: int, max_w: int, bold: bool = False, min_size: int = 20) -> ImageFont.FreeTypeFont:
    cur = _font(size, bold)
    while size > min_size and draw.textlength(text, font=cur) > max_w:
        size -= 2
        cur = _font(size, bold)
    return cur


def _wrap_rich(draw, line: str, font, max_w) -> list[list[tuple]]:
    """Wrap a *accent*-marked line into rendered lines of (text, is_accent) parts."""
    words = []
    for i, part in enumerate(line.split("*")):
        if not part:
            continue
        accent = i % 2 == 1
        words.extend([(w, accent) for w in part.split(" ") if w])
    rendered, cur, cur_w = [], [], 0.0
    for word, accent in words:
        w = draw.textlength(word + " ", font=font)
        if cur and cur_w + w > max_w:
            rendered.append(cur)
            cur, cur_w = [], 0.0
        cur.append((word, accent))
        cur_w += w
    if cur:
        rendered.append(cur)
    return rendered


def _draw_rich_line(draw, parts, x, y, font, accent):
    for text, is_accent in parts:
        color = accent if is_accent else TEXT
        draw.text((x, y), text, font=font, fill=color + (255,))
        x += draw.textlength(text, font=font)


def render_slide(spec: tuple, index: int, total: int, accent) -> Image.Image:
    kind, kicker, title, lines, _ = spec
    img = _gradient_bg()
    draw = ImageDraw.Draw(img, "RGBA")

    draw.rectangle([0, 0, W, 8], fill=accent + (230,))

    if kind == "title":
        f_kick = _font(24, True)
        f_sub = _font(30)
        f_title = _fit_font(draw, title, 64, W - 200, bold=True)
        draw.text((W / 2, 296), kicker.upper(), font=f_kick, fill=accent + (255,), anchor="mm", spacing=6)
        draw.text((W / 2, 360), title, font=f_title, fill=TEXT + (255,), anchor="mm")
        draw.line([W / 2 - 46, 446, W / 2 + 46, 446], fill=accent + (255,), width=4)
        draw.text((W / 2, 486), lines[0], font=f_sub, fill=MUTED + (255,), anchor="mm")
    elif kind == "summary":
        f_kick = _font(24, True)
        f_line = _font(28)
        f_title = _fit_font(draw, title, 56, W - 200, bold=True)
        draw.text((W / 2, 200), kicker.upper(), font=f_kick, fill=accent + (255,), anchor="mm")
        draw.text((W / 2, 268), title, font=f_title, fill=TEXT + (255,), anchor="mm")
        y = 380
        for line in lines:
            line = line.replace("*", "")
            draw.ellipse([92, y + 8, 100, y + 16], fill=accent + (255,))
            draw.text((124, y), line, font=f_line, fill=TEXT + (255,))
            y += int(f_line.size * 1.6)
    else:  # content
        f_kick = _font(24, True)
        f_title = _fit_font(draw, title, 52, W - 184, bold=True)
        f_line = _font(30)
        draw.text((92, 92), kicker.upper(), font=f_kick, fill=accent + (255,))
        draw.text((92, 136), title, font=f_title, fill=TEXT + (255,))
        draw.line([92, 244, W - 92, 244], fill=(71, 85, 105, 255), width=2)

        max_w = W - 184 - 64
        rows: list[list[tuple]] = []
        for line in lines:
            rows.extend(_wrap_rich(draw, line, f_line, max_w))

        panel_h = 92 + len(rows) * 44
        draw.rounded_rectangle([92, 282, W - 92, 282 + panel_h], radius=18, fill=PANEL)
        y = 282 + 52
        for row in rows:
            draw.ellipse([124, y + 6, 134, y + 16], fill=accent + (255,))
            _draw_rich_line(draw, row, 152, y, f_line, accent)
            y += 44

    # footer
    f_foot = _font(20)
    draw.text((92, H - 58), BRAND, font=f_foot, fill=MUTED + (255,))
    draw.text((W - 92, H - 58), f"Slide {index + 1} / {total}", font=f_foot, fill=MUTED + (255,), anchor="rm")
    seg_w = (W - 184) / total
    for i in range(total):
        filled = i <= index
        draw.rectangle(
            [92 + i * seg_w, H - 28, 92 + (i + 1) * seg_w - 6, H - 20],
            fill=accent + (255,) if filled else (51, 65, 85, 255),
        )
    return img


def _tts(text: str, lang: str, out: Path):
    from gtts import gTTS

    gTTS(text=text, lang=lang, slow=False).save(str(out))


def _audio_duration(mp3: Path) -> float:
    out = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", str(mp3), "-f", "null", "-"],
        capture_output=True, text=True,
    )
    line = out.stderr.strip().splitlines()[-1]
    time_str = line.split("time=")[1].split(" ")[0]
    h, m, s = time_str.split(":")
    return float(h) * 3600 + float(m) * 60 + float(s)


def _render_clip(png: Path, mp3: Path, duration: float, out: Path):
    subprocess.run(
        [
            FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
            "-loop", "1", "-i", str(png),
            "-i", str(mp3),
            "-filter_complex", "[0:v]fade=t=in:st=0:d=0.6,fade=t=out:st={}:d=0.6[v]".format(max(0.1, duration - 0.6)),
            "-map", "[v]", "-map", "1:a",
            "-t", f"{duration:.2f}",
            "-r", str(FPS),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-ac", "2",
            "-movflags", "+faststart",
            str(out),
        ],
        check=True, capture_output=True,
    )


def build_lesson(slug: str, lang: str):
    WORK.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    accent = ACCENTS[slug]
    slides = SLIDES_NE[slug] if lang == "ne" else SLIDES[slug]
    clips, durations = [], []

    for i, spec in enumerate(slides):
        total = len(slides)
        png = WORK / f"{slug}_{lang}_{i}_slide.png"
        mp3 = WORK / f"{slug}_{lang}_{i}_narration.mp3"
        clip = WORK / f"{slug}_{lang}_{i}_clip.mp4"

        kind = "title" if i == 0 else ("summary" if i == total - 1 else "content")
        if len(spec) == 4:
            spec = (kind, *spec)
        render_slide(spec, i, total, accent).save(png)
        _tts(spec[4], "ne" if lang == "ne" else "en", mp3)
        dur = _audio_duration(mp3) + (3.5 if spec[0] == "title" else 1.8)
        dur = max(dur, 8.0)
        _render_clip(png, mp3, dur, clip)
        clips.append(clip)
        durations.append(dur)

    list_file = WORK / f"{slug}_{lang}_list.txt"
    list_file.write_text("".join(f"file '{c}'\n" for c in clips))
    final = OUT_DIR / f"{slug}_{lang}.mp4"
    subprocess.run(
        [FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
         "-f", "concat", "-safe", "0", "-i", str(list_file),
         "-c", "copy", str(final)],
        check=True, capture_output=True,
    )
    return final, sum(durations)


def _probe_duration(mp4: Path) -> float:
    out = subprocess.run([FFMPEG, "-hide_banner", "-i", str(mp4), "-f", "null", "-"],
                         capture_output=True, text=True)
    line = out.stderr.strip().splitlines()[-1]
    time_str = line.split("time=")[1].split(" ")[0]
    h, m, s = time_str.split(":")
    return round(float(h) * 3600 + float(m) * 60 + float(s), 1)


def write_manifest():
    """durations.json lets the backend set duration_seconds without ffprobe."""
    data = {}
    for slug in SLIDES:
        data[slug] = {
            lang: _probe_duration(OUT_DIR / f"{slug}_{lang}.mp4")
            for lang in ("en", "ne")
        }
    (OUT_DIR / "durations.json").write_text(
        json.dumps(data, indent=2, ensure_ascii=False)
    )
    print("manifest:", json.dumps(data))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default=None, help="build a single slug")
    parser.add_argument("--lang", default=None, choices=["en", "ne"])
    args = parser.parse_args()

    slugs = [args.only] if args.only else list(SLIDES.keys())
    langs = [args.lang] if args.lang else ["en", "ne"]
    for slug in slugs:
        for lang in langs:
            final, total = build_lesson(slug, lang)
            print(f"OK {final.name}  ({total / 60:.1f} min)")
    write_manifest()
    print("done")


if __name__ == "__main__":
    main()