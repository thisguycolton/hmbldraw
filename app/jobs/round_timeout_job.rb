class RoundTimeoutJob < ApplicationJob
  queue_as :default

  def perform(round_id)
    round =
      Round.includes(:game_room).find_by(
        id: round_id
      )

    return unless round

    game_room = round.game_room

    deadline =
      round.started_at +
      game_room.round_duration.seconds

    if Time.current < deadline
      self.class
        .set(wait_until: deadline)
        .perform_later(round.id)

      return
    end

    GameRoomGame.end_round!(
      game_room,
      round
    )
  rescue GameRoomGame::Error => e
    Rails.logger.info(
      "[RoundTimeoutJob] Round #{round_id}: #{e.message}"
    )
  rescue StandardError => e
    Rails.logger.error(
      "[RoundTimeoutJob] Failed for round #{round_id}: " \
      "#{e.class}: #{e.message}"
    )

    raise
  end
end
