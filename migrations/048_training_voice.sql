-- Interview-Training: Gegenüber wählbar (f = Interviewerin, m = Interviewer)
ALTER TABLE interview_trainings ADD COLUMN voice text NOT NULL DEFAULT 'f';
