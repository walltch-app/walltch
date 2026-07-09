use std::time::SystemTime;

use walltch_core::ports::Clock;

pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> SystemTime {
        SystemTime::now()
    }
}
