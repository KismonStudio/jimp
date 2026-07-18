use std::{env, fs, process};

const MAGIC: &[u8; 4] = b"JIMP";
const VERSION: u16 = 1;
const PRINT: u8 = 1;
const HALT: u8 = 255;

fn read_u16(bytes: &[u8], offset: &mut usize) -> Result<u16, String> {
    let value = bytes.get(*offset..*offset + 2).ok_or("Unexpected end of bytecode.")?;
    *offset += 2;
    Ok(u16::from_le_bytes([value[0], value[1]]))
}

fn read_u32(bytes: &[u8], offset: &mut usize) -> Result<u32, String> {
    let value = bytes.get(*offset..*offset + 4).ok_or("Unexpected end of bytecode.")?;
    *offset += 4;
    Ok(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
}

fn execute(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 10 || bytes.get(0..4) != Some(MAGIC) { return Err("Invalid JIMP bytecode magic.".into()); }
    let mut offset = 4;
    if read_u16(bytes, &mut offset)? != VERSION { return Err("Unsupported JIMP bytecode version.".into()); }
    let instruction_count = read_u32(bytes, &mut offset)?;
    let mut halted = false;

    for _ in 0..instruction_count {
        let opcode = *bytes.get(offset).ok_or("Unexpected end of bytecode.")?;
        offset += 1;
        match opcode {
            PRINT => {
                let length = read_u16(bytes, &mut offset)? as usize;
                let value = bytes.get(offset..offset + length).ok_or("Unexpected end of bytecode.")?;
                offset += length;
                println!("{}", std::str::from_utf8(value).map_err(|_| "Invalid UTF-8 string constant.")?);
            }
            HALT => { halted = true; break; }
            _ => return Err(format!("Unsupported opcode {opcode}.")),
        }
    }

    if !halted { return Err("Program must terminate with HALT.".into()); }
    if offset != bytes.len() { return Err("Trailing bytes after program termination.".into()); }
    Ok(())
}

fn main() {
    let Some(path) = env::args().nth(1) else {
        eprintln!("Usage: jimp-runtime <program.jbc>"); process::exit(2);
    };
    match fs::read(path).map_err(|error| error.to_string()).and_then(|bytes| execute(&bytes)) {
        Ok(()) => {}
        Err(error) => { eprintln!("Runtime error: {error}"); process::exit(1); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_magic() { assert!(execute(b"NOPE").is_err()); }

    #[test]
    fn accepts_empty_program() {
        let mut bytes = b"JIMP".to_vec();
        bytes.extend(VERSION.to_le_bytes());
        bytes.extend(1_u32.to_le_bytes());
        bytes.push(HALT);
        assert!(execute(&bytes).is_ok());
    }
}
