class RoundAdvanceJob < ApplicationJob
  queue_as :default

  def perform(round_id)
    round =
      Round
        .includes(:game_room)
        .find_by(id: round_id)

    return unless round

    game_room = round.game_room

    GameRoomGame.advance!(
      game_room,
      round
    )
  rescue GameRoomGame::Error => e
    Rails.logger.info(
      "[RoundAdvanceJob] Round #{round_id}: #{e.message}"
    )
  rescue StandardError => e
    Rails.logger.error(
      "[RoundAdvanceJob] Failed for round #{round_id}: " \
      "#{e.class}: #{e.message}"
    )

    Rails.logger.error(
      e.backtrace.first(10).join("\n")
    )

    raise
  end
end
