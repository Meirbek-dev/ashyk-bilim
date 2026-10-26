//! Account emails in the recipient's language: the interface language of the
//! request when known, else the account's, else Russian (the platform's base
//! language, as on the web). The web catalogs hold the same wording.

use ab_core::language::Language;

/// What a code email says around the code.
pub(super) struct CodeCopy {
    pub subject: &'static str,
    pub code_line: &'static str,
    /// The link text (verification, reset) or what to do with the code (address change).
    pub action: &'static str,
    pub ignore: &'static str,
}

pub(super) fn greeting(language: Language, name: &str) -> String {
    match language {
        Language::Ru => format!("Здравствуйте, {name}!"),
        Language::Kk => format!("Сәлеметсіз бе, {name}!"),
        Language::En => format!("Hello, {name}!"),
    }
}

pub(super) const fn verification(language: Language) -> CodeCopy {
    match language {
        Language::Ru => CodeCopy {
            subject: "Подтвердите адрес электронной почты - Ashyq Bilim",
            code_line: "Код подтверждения адреса электронной почты",
            action: "Подтвердить адрес",
            ignore: "Если вы не регистрировались на Ashyq Bilim, просто проигнорируйте это письмо.",
        },
        Language::Kk => CodeCopy {
            subject: "Электрондық пошта мекенжайын растаңыз - Ashyq Bilim",
            code_line: "Электрондық пошта мекенжайын растау коды",
            action: "Мекенжайды растау",
            ignore: "Егер сіз Ashyq Bilim-де тіркелмеген болсаңыз, бұл хатты елемеңіз.",
        },
        Language::En => CodeCopy {
            subject: "Confirm your email address - Ashyq Bilim",
            code_line: "Email confirmation code",
            action: "Confirm the address",
            ignore: "If you did not sign up for Ashyq Bilim, you can ignore this email.",
        },
    }
}

pub(super) const fn password_reset(language: Language) -> CodeCopy {
    match language {
        Language::Ru => CodeCopy {
            subject: "Восстановление пароля - Ashyq Bilim",
            code_line: "Код для восстановления пароля",
            action: "Задать новый пароль",
            ignore: "Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.",
        },
        Language::Kk => CodeCopy {
            subject: "Құпиясөзді қалпына келтіру - Ashyq Bilim",
            code_line: "Құпиясөзді қалпына келтіру коды",
            action: "Жаңа құпиясөз орнату",
            ignore: "Егер сіз құпиясөзді қалпына келтіруді сұрамаған болсаңыз, бұл хатты елемеңіз.",
        },
        Language::En => CodeCopy {
            subject: "Reset your password - Ashyq Bilim",
            code_line: "Password reset code",
            action: "Set a new password",
            ignore: "If you did not ask to reset your password, you can ignore this email.",
        },
    }
}

pub(super) const fn email_change(language: Language) -> CodeCopy {
    match language {
        Language::Ru => CodeCopy {
            subject: "Подтвердите новый адрес почты - Ashyq Bilim",
            code_line: "Код для смены адреса почты",
            action: "Введите его в настройках профиля. Код действует один час.",
            ignore: "Если вы не меняли адрес, просто проигнорируйте это письмо.",
        },
        Language::Kk => CodeCopy {
            subject: "Жаңа пошта мекенжайын растаңыз - Ashyq Bilim",
            code_line: "Пошта мекенжайын ауыстыру коды",
            action: "Оны профиль баптауларына енгізіңіз. Код бір сағат жарамды.",
            ignore: "Егер сіз мекенжайды өзгертпеген болсаңыз, бұл хатты елемеңіз.",
        },
        Language::En => CodeCopy {
            subject: "Confirm your new email address - Ashyq Bilim",
            code_line: "Code to change your email address",
            action: "Enter it in your profile settings. The code is valid for one hour.",
            ignore: "If you did not change your address, you can ignore this email.",
        },
    }
}

/// The notice to the old address: (subject, what changed with `{new}` filled in, what to do if it was not them).
pub(super) fn email_changed(language: Language, new: &str) -> (&'static str, String, &'static str) {
    match language {
        Language::Ru => (
            "Адрес почты изменён - Ashyq Bilim",
            format!("Адрес почты вашей учётной записи Ashyq Bilim изменён на {new}."),
            "Если это были не вы, восстановите доступ через «Забыли пароль?» и напишите администратору платформы.",
        ),
        Language::Kk => (
            "Пошта мекенжайы өзгертілді - Ashyq Bilim",
            format!("Ashyq Bilim тіркелгіңіздің пошта мекенжайы {new} болып өзгертілді."),
            "Егер мұны сіз жасамаған болсаңыз, «Құпиясөзді ұмыттыңыз ба?» арқылы кіруді қалпына келтіріп, платформа әкімшісіне жазыңыз.",
        ),
        Language::En => (
            "Email address changed - Ashyq Bilim",
            format!("The email address of your Ashyq Bilim account was changed to {new}."),
            "If this was not you, regain access with «Forgot password?» and write to the platform administrator.",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: [Language; 3] = [Language::Ru, Language::Kk, Language::En];

    #[test]
    fn every_language_has_its_own_copy() {
        for build in [verification, password_reset, email_change] {
            let subjects: Vec<_> = ALL.iter().map(|&l| build(l).subject).collect();
            assert_eq!(subjects.len(), 3);
            assert!(
                subjects[0] != subjects[1]
                    && subjects[1] != subjects[2]
                    && subjects[0] != subjects[2]
            );
            assert!(subjects.iter().all(|s| s.ends_with(" - Ashyq Bilim")));
        }
        assert_eq!(greeting(Language::Kk, "Айгерим"), "Сәлеметсіз бе, Айгерим!");
        assert!(email_changed(Language::En, "a@b.kz").1.contains("a@b.kz"));
    }
}
