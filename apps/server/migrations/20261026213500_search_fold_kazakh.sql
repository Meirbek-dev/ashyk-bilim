-- Search for a Kazakh name typed on a Russian keyboard: «казак» finds «Қазақ тілі», «искери» finds «іскери»,
-- «учеба» finds «учёба». Kazakh letters fold to the Russian letter typed in their place (ә→а, ғ→г, қ→к, ң→н,
-- ө→о, ұ ү→у, һ→х, і→и) and ё to е, before the Cyrillic look-alikes fold to Latin as in 20260926000001
-- (and и joins і as Latin i). One pass of translate: each letter maps straight to its final form.
-- `letters` (one-character words) stay unfolded, so «c» is still not the preposition «с».
CREATE OR REPLACE FUNCTION search_fold(t text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    RETURN translate(lower(t), 'авекмнорстухіәғқңөұүһёи', 'abekmhopctyxiaгkhoyyxei');
