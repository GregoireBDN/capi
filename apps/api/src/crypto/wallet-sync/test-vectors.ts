/**
 * Published test vectors only (never a real wallet): the account keys of the
 * BIP39 test mnemonic "abandon abandon … about" at m/44'/0'/0' (BIP44),
 * m/49'/0'/0' (BIP49) and m/84'/0'/0' (BIP84, whose addresses are listed in
 * the BIP84 document).
 */
export const BIP44_XPUB =
  'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj'
export const BIP49_YPUB =
  'ypub6Ww3ibxVfGzLrAH1PNcjyAWenMTbbAosGNB6VvmSEgytSER9azLDWCxoJwW7Ke7icmizBMXrzBx9979FfaHxHcrArf3zbeJJJUZPf663zsP'
export const BIP84_ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
/**
 * The BIP84 account key above serialized with `xpub` version bytes, as Ledger
 * Live exports native SegWit accounts: same key, so the same `bc1q…`
 * addresses once derived as native SegWit.
 */
export const BIP84_AS_XPUB =
  'xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V'
