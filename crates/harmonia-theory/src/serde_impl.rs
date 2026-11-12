//! Sérialisation des types qui ont une écriture musicale naturelle.
//!
//! Une note voyage en JSON sous la forme `"C#"`, un accord `"Am7/G"`, un
//! intervalle `"m3"`, une tonalité `"A minor"`, une progression `"I-V-vi-IV"` :
//! exactement ce que lisent et écrivent `FromStr` et `Display`. Le contrat
//! d'API reste lisible et ne dépend pas de la structure interne du moteur.

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::{Chord, Interval, Key, Note, Pitch, Progression, RomanNumeral, ScaleType};

macro_rules! serde_as_string {
    ($($ty:ty),* $(,)?) => {$(
        impl Serialize for $ty {
            fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                serializer.collect_str(self)
            }
        }

        impl<'de> Deserialize<'de> for $ty {
            fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                let text = String::deserialize(deserializer)?;
                text.parse().map_err(serde::de::Error::custom)
            }
        }
    )*};
}

serde_as_string!(Note, Pitch, Interval, Chord, Key, RomanNumeral, Progression);

impl Serialize for ScaleType {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.id())
    }
}

impl<'de> Deserialize<'de> for ScaleType {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = String::deserialize(deserializer)?;
        ScaleType::from_id(&text)
            .ok_or_else(|| serde::de::Error::custom(format!("type de gamme inconnu : « {text} »")))
    }
}

#[cfg(test)]
mod tests {
    use crate::relations::{Graph, Node};
    use crate::*;
    use serde_json::json;

    fn round_trip<T>(value: &T) -> serde_json::Value
    where
        T: serde::Serialize + serde::de::DeserializeOwned + PartialEq + std::fmt::Debug,
    {
        let encoded = serde_json::to_value(value).unwrap();
        let decoded: T = serde_json::from_value(encoded.clone()).unwrap();
        assert_eq!(&decoded, value);
        encoded
    }

    #[test]
    fn musical_values_travel_as_their_notation() {
        assert_eq!(round_trip(&"F#".parse::<Note>().unwrap()), json!("F#"));
        assert_eq!(round_trip(&"Bb3".parse::<Pitch>().unwrap()), json!("Bb3"));
        assert_eq!(round_trip(&Interval::MINOR_THIRD), json!("m3"));
        assert_eq!(round_trip(&"Am7/G".parse::<Chord>().unwrap()), json!("Am7/G"));
        assert_eq!(round_trip(&"F#m".parse::<Key>().unwrap()), json!("F# minor"));
        assert_eq!(round_trip(&"V7/V".parse::<RomanNumeral>().unwrap()), json!("V7/V"));
        assert_eq!(
            round_trip(&"I-V-vi-IV".parse::<Progression>().unwrap()),
            json!("I-V-vi-IV")
        );
        assert_eq!(round_trip(&ScaleType::HarmonicMinor), json!("harmonic_minor"));
        assert_eq!(
            round_trip(&Scale::new("D".parse().unwrap(), ScaleType::Dorian)),
            json!({"tonic": "D", "kind": "dorian"})
        );
        assert_eq!(round_trip(&ChordQuality::HalfDiminished7), json!("half_diminished7"));
        assert_eq!(round_trip(&Cadence::Deceptive), json!("deceptive"));
    }

    #[test]
    fn invalid_notation_is_rejected() {
        assert!(serde_json::from_value::<Note>(json!("H")).is_err());
        assert!(serde_json::from_value::<Chord>(json!("Cfoo")).is_err());
        assert!(serde_json::from_value::<Interval>(json!("M5")).is_err());
        assert!(serde_json::from_value::<ScaleType>(json!("nope")).is_err());
        assert!(serde_json::from_value::<Note>(json!(3)).is_err());
    }

    #[test]
    fn every_preset_instrument_round_trips() {
        for instrument in Instrument::presets() {
            round_trip(&instrument);
        }
        let guitar = serde_json::to_value(Instrument::guitar()).unwrap();
        assert_eq!(guitar["family"], json!("plucked_string"));
        assert_eq!(
            guitar["layout"]["strings"]["open"],
            json!(["E2", "A2", "D3", "G3", "B3", "E4"])
        );
        assert_eq!(guitar["transposition"], json!({"sounds_below": "P8"}));
        assert_eq!(guitar["range"], json!(["E2", "D6"]));
    }

    #[test]
    fn a_custom_instrument_can_be_read_from_json() {
        let ukulele: Instrument = serde_json::from_value(json!({
            "id": "ukulele",
            "name": "Ukulele",
            "family": "plucked_string",
            "layout": {"strings": {"open": ["G4", "C4", "E4", "A4"], "span": 12, "fretted": true}},
            "range": ["C4", "A5"],
            "transposition": "concert"
        }))
        .unwrap();
        assert_eq!(ukulele.positions("C4".parse().unwrap()).len(), 1);
    }

    #[test]
    fn the_graph_serializes_for_the_explorer() {
        let graph = Graph::around(Node::from_id("key:C:major").unwrap(), 1);
        let encoded = serde_json::to_value(&graph).unwrap();
        assert_eq!(encoded["nodes"][0], json!({"key": "C major"}));
        assert_eq!(encoded["links"][0]["relation"], json!("scale_of_key"));
        assert_eq!(encoded["links"][0]["source"], json!(0));
        let relative = encoded["links"]
            .as_array()
            .unwrap()
            .iter()
            .find(|l| l["relation"] == json!("relative_key"))
            .unwrap();
        let target = relative["target"].as_u64().unwrap() as usize;
        assert_eq!(encoded["nodes"][target], json!({"key": "A minor"}));
    }
}
